import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { supabaseAdmin } from '../services/supabase.js'
import { getAvailableSlots } from '../services/slots.js'
import { createCalendarEvent, deleteCalendarEvent } from '../services/google-calendar.js'
import { sendBookingConfirmation, notifyDorisNewBooking } from '../services/email.js'
import { notifyDorisSms } from '../services/sms.js'
import { scheduleReminders, cancelReminders } from '../jobs/reminder-scheduler.js'
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

  // Fire-and-forget: calendar event + notifications (all with .catch to prevent crashes)
  const clientEmail = req.user!.email
  createCalendarEvent(booking, clientEmail).then(async eventId => {
    if (eventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
    }
  }).catch(err => console.error('Calendar event failed:', err))
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

  // Only admin can mark as completed, owner or admin can cancel
  if (parsed.data.status === 'completed' && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Only admin can mark bookings as completed' })
    return
  }

  if (parsed.data.status === 'cancelled' && booking.user_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Access denied' })
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

  // On cancel: delete calendar event + cancel pending reminders
  if (parsed.data.status === 'cancelled' && booking.google_event_id) {
    deleteCalendarEvent(booking.google_event_id).catch(err => console.error('Delete calendar event failed:', err))
  }
  if (parsed.data.status === 'cancelled') {
    cancelReminders(booking.id).catch(err => console.error('Cancel reminders failed:', err))
  }

  res.json(updated)
})
