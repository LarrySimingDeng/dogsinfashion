import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { supabaseAdmin } from '../services/supabase.js'
import { getAvailableSlots } from '../services/slots.js'
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '../services/google-calendar.js'
import {
  sendBookingConfirmation,
  notifyDorisNewBooking,
  sendRescheduleNotification,
  notifyDorisReschedule,
  sendCancellationNotification,
  notifyDorisCancellation,
} from '../services/email.js'
import { notifyDorisSms, notifyDorisRescheduleSms } from '../services/sms.js'
import { scheduleReminders, cancelReminders } from '../jobs/reminder-scheduler.js'
import { config } from '../config.js'
import type { AuthRequest } from '../types.js'
import { SERVICE_DURATIONS } from '../data/services.js'

export const bookingsRouter = Router()

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h! * 60 + m! + minutes
  const rh = Math.floor(total / 60)
  const rm = total % 60
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`
}

// Create booking
bookingsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    service_id: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    dog_name: z.string().min(1),
    dog_breed: z.string().optional(),
    address: z.string().min(1),
    notes: z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { service_id, date, start_time, dog_name, dog_breed, address, notes } = parsed.data
  const duration = SERVICE_DURATIONS[service_id]
  if (!duration) {
    res.status(400).json({ error: 'Invalid service_id' })
    return
  }

  const end_time = addMinutesToTime(start_time, duration * 60)

  // Verify slot is still available (prevent double-booking)
  const available = await getAvailableSlots(date, service_id)
  const isAvailable = available.some(s => s.start === start_time)
  if (!isAvailable) {
    res.status(409).json({ error: 'This time slot is no longer available' })
    return
  }

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      user_id: req.user!.id,
      service_id,
      date,
      start_time,
      end_time,
      dog_name,
      dog_breed: dog_breed ?? null,
      address,
      notes: notes ?? null,
      status: 'confirmed',
    })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Await calendar event creation to prevent race with sync job.
  // If this fails, the sync job will retry later as a safety net.
  const clientEmail = req.user!.email
  try {
    const eventId = await createCalendarEvent(booking, clientEmail)
    if (eventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
      booking.google_event_id = eventId
    }
  } catch (err) {
    console.error('Calendar event failed:', err)
  }

  // Fire-and-forget notifications (no duplicate risk)
  sendBookingConfirmation(booking, clientEmail).catch(err => console.error('Confirmation email failed:', err))
  notifyDorisNewBooking(booking, clientEmail).catch(err => console.error('Doris email failed:', err))
  notifyDorisSms(booking).catch(err => console.error('Doris SMS failed:', err))
  scheduleReminders(booking, clientEmail).catch(err => console.error('Schedule reminders failed:', err))

  res.status(201).json(booking)
})

// Get bookings (user sees own, admin sees all)
bookingsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin'

  let query = supabaseAdmin
    .from('bookings')
    .select('*')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (!isAdmin) {
    query = query.eq('user_id', req.user!.id)
  }

  // Optional filters
  const { status, from, to } = req.query as Record<string, string | undefined>
  if (status) query = query.eq('status', status)
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data ?? [])
})

// Get single booking
bookingsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !booking) {
    res.status(404).json({ error: 'Booking not found' })
    return
  }

  // Only owner or admin can view
  if (booking.user_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  res.json(booking)
})

// Update booking status (admin or owner for cancel)
bookingsRouter.patch('/:id/status', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    status: z.enum(['completed', 'cancelled']),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' })
    return
  }

  // Get booking first
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (!booking) {
    res.status(404).json({ error: 'Booking not found' })
    return
  }

  // Admin-only for both completed and cancelled
  if (parsed.data.status === 'completed' && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Only admin can mark bookings as completed' })
    return
  }

  if (parsed.data.status === 'cancelled' && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Only admin can cancel bookings' })
    return
  }

  const { data: updated, error } = await supabaseAdmin
    .from('bookings')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // On cancel: sync calendar, cancel reminders, notify customer + Doris
  if (parsed.data.status === 'cancelled') {
    // Fetch the client email (admin != booking owner)
    let clientEmail = req.user!.email
    if (booking.user_id !== req.user!.id) {
      try {
        const { data: { user: clientUser } } = await supabaseAdmin.auth.admin.getUserById(booking.user_id)
        if (clientUser?.email) clientEmail = clientUser.email
      } catch (err) {
        console.error('[cancel] failed to fetch client email:', err)
      }
    }

    // Await calendar delete so failures are observable
    if (booking.google_event_id) {
      try {
        await deleteCalendarEvent(booking.google_event_id)
      } catch (err) {
        console.error('[cancel] calendar delete failed', {
          bookingId: booking.id,
          eventId: booking.google_event_id,
          err,
        })
        // Don't roll back DB; calendar inconsistency is secondary
      }
    }

    // Await reminder cancellation
    try {
      await cancelReminders(booking.id)
    } catch (err) {
      console.error('[cancel] cancel reminders failed', { bookingId: booking.id, err })
    }

    // Fire-and-forget emails
    sendCancellationNotification(updated, clientEmail)
      .catch(err => console.error('[cancel] customer email failed:', err))
    notifyDorisCancellation(updated, clientEmail)
      .catch(err => console.error('[cancel] Doris email failed:', err))
  }

  res.json(updated)
})

// Reschedule booking (change date/time)
bookingsRouter.patch('/:id/reschedule', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  // Get existing booking
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (!booking) {
    res.status(404).json({ error: 'Booking not found' })
    return
  }

  // Authorization: owner or admin
  if (booking.user_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  // Only confirmed bookings can be rescheduled
  if (booking.status !== 'confirmed') {
    res.status(400).json({ error: 'Only confirmed bookings can be rescheduled' })
    return
  }

  // 24-hour advance notice check (skipped in development)
  if (config.NODE_ENV !== 'development') {
    const existingStart = new Date(`${booking.date}T${booking.start_time}`)
    const hoursUntil = (existingStart.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < 24) {
      res.status(400).json({ error: 'Cannot reschedule within 24 hours of the appointment' })
      return
    }
  }

  const { date, start_time } = parsed.data

  // No-op check
  if (date === booking.date && start_time === booking.start_time) {
    res.json(booking)
    return
  }

  // Calculate end_time
  const duration = SERVICE_DURATIONS[booking.service_id]
  if (!duration) {
    res.status(400).json({ error: 'Invalid service_id' })
    return
  }
  const end_time = addMinutesToTime(start_time, duration * 60)

  // Verify new slot is available (exclude current booking to avoid self-conflict)
  const available = await getAvailableSlots(date, booking.service_id, booking.id)
  const isAvailable = available.some(s => s.start === start_time)
  if (!isAvailable) {
    res.status(409).json({ error: 'This time slot is no longer available' })
    return
  }

  // Update booking (optimistic lock on status='confirmed')
  const { data: updated, error } = await supabaseAdmin
    .from('bookings')
    .update({
      date,
      start_time,
      end_time,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .eq('status', 'confirmed')
    .select()
    .single()

  if (error || !updated) {
    res.status(500).json({ error: error?.message ?? 'Failed to update booking' })
    return
  }

  // Return immediately, side effects are fire-and-forget
  res.json(updated)

  const oldDate = booking.date
  const oldStartTime = booking.start_time

  // Get the actual client email (req.user may be admin, not the booking owner)
  let clientEmail = req.user!.email
  if (booking.user_id !== req.user!.id) {
    try {
      const { data: { user: clientUser } } = await supabaseAdmin.auth.admin.getUserById(booking.user_id)
      if (clientUser?.email) clientEmail = clientUser.email
    } catch (err) {
      console.error('Failed to fetch client email:', err)
    }
  }

  // Update Google Calendar event (fallback to create if event not found)
  const calendarUpdate = async () => {
    if (booking.google_event_id) {
      const ok = await updateCalendarEvent(booking.google_event_id, updated, clientEmail)
      if (ok) return
    }
    // Event missing or no event ID — create a new one
    const newEventId = await createCalendarEvent(updated, clientEmail)
    if (newEventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: newEventId }).eq('id', updated.id)
    }
  }
  calendarUpdate().catch(err => console.error('[reschedule] calendar sync failed:', err))

  // Send reschedule notifications
  sendRescheduleNotification(updated, clientEmail, oldDate, oldStartTime)
    .catch(err => console.error('Reschedule notification failed:', err))
  notifyDorisReschedule(updated, clientEmail, oldDate, oldStartTime)
    .catch(err => console.error('Doris reschedule email failed:', err))
  notifyDorisRescheduleSms(updated, oldDate, oldStartTime)
    .catch(err => console.error('Doris reschedule SMS failed:', err))

  // Reschedule reminders: cancel old ones, schedule new ones
  cancelReminders(booking.id)
    .then(() => scheduleReminders(updated, clientEmail))
    .catch(err => console.error('Reschedule reminders failed:', err))
})
