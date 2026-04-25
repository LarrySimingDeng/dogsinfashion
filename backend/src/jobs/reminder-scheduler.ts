import { supabaseAdmin } from '../services/supabase.js'
import { sendReminderEmail, sendThankYouEmail } from '../services/email.js'
import { sendSmsReminder } from '../services/sms.js'
import type { Booking } from '../types.js'
import { SERVICE_NAMES } from '../data/services.js'

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
}

// Fetch admin reminder settings (with defaults)
async function getReminderSettings() {
  const { data } = await supabaseAdmin
    .from('reminder_settings')
    .select('*')
    .limit(1)
    .single()

  return {
    email_enabled: data?.email_enabled ?? true,
    email_hours_before: data?.email_hours_before ?? 24,
    sms_enabled: data?.sms_enabled ?? true,
    sms_hours_before: data?.sms_hours_before ?? 2,
  }
}

// Schedule reminders when a booking is created
export async function scheduleReminders(booking: Booking, clientEmail: string): Promise<void> {
  const settings = await getReminderSettings()
  // start_time may be "09:00" or "09:00:00" from DB — normalize
  const normTime = (t: string) => t.length === 5 ? `${t}:00` : t
  const bookingDateTime = new Date(`${booking.date}T${normTime(booking.start_time)}`)

  const reminders: Array<{
    booking_id: string
    type: string
    scheduled_at: string
    status: string
    metadata: string
  }> = []

  // Email reminder
  if (settings.email_enabled) {
    const emailTime = new Date(bookingDateTime.getTime() - settings.email_hours_before * 60 * 60 * 1000)
    reminders.push({
      booking_id: booking.id,
      type: 'email',
      scheduled_at: emailTime.toISOString(),
      status: 'pending',
      metadata: JSON.stringify({ client_email: clientEmail }),
    })
  }

  // Thank-you email — fires 30 min after the booking ends. Pure copy + Yelp
  // incentive; not gated by settings since it's transactional follow-up.
  const normEndTime = booking.end_time ? normTime(booking.end_time) : null
  if (normEndTime) {
    const endDateTime = new Date(`${booking.date}T${normEndTime}`)
    const thankYouTime = new Date(endDateTime.getTime() + 30 * 60 * 1000)
    reminders.push({
      booking_id: booking.id,
      type: 'thank_you',
      scheduled_at: thankYouTime.toISOString(),
      status: 'pending',
      metadata: JSON.stringify({ client_email: clientEmail }),
    })
  }

  // SMS reminder — only if enabled AND we have a phone for the client.
  // Prefer the phone the user entered for THIS booking. profiles.phone is
  // rarely populated (no edit-profile UI exists; signup doesn't ask), so
  // falling back to it would silently drop SMS for most users.
  if (settings.sms_enabled) {
    let smsPhone: string | null = booking.phone ?? null
    if (!smsPhone) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('phone')
        .eq('id', booking.user_id)
        .single()
      smsPhone = profile?.phone ?? null
    }

    if (smsPhone) {
      const smsTime = new Date(bookingDateTime.getTime() - settings.sms_hours_before * 60 * 60 * 1000)
      reminders.push({
        booking_id: booking.id,
        type: 'sms',
        scheduled_at: smsTime.toISOString(),
        status: 'pending',
        metadata: JSON.stringify({ phone: smsPhone }),
      })
    }
  }

  if (reminders.length > 0) {
    await supabaseAdmin.from('reminders').insert(reminders)
  }
}

// Cancel pending reminders for a booking
export async function cancelReminders(bookingId: string): Promise<void> {
  await supabaseAdmin
    .from('reminders')
    .delete()
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
}

// Process due reminders — called on interval
export async function processPendingReminders(): Promise<void> {
  const now = new Date().toISOString()

  const { data: reminders } = await supabaseAdmin
    .from('reminders')
    .select('*, bookings(*)')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50)

  if (!reminders || reminders.length === 0) return

  for (const reminder of reminders) {
    const booking = reminder.bookings as unknown as Booking | null
    if (!booking || booking.status === 'cancelled') {
      // Booking cancelled, mark reminder as sent (skip)
      await supabaseAdmin.from('reminders').update({ status: 'sent', sent_at: now }).eq('id', reminder.id)
      continue
    }

    try {
      const meta = reminder.metadata ? JSON.parse(reminder.metadata) : {}

      if (reminder.type === 'email' && meta.client_email) {
        await sendReminderEmail(booking, meta.client_email)
      } else if (reminder.type === 'thank_you' && meta.client_email) {
        await sendThankYouEmail(booking, meta.client_email)
      } else if (reminder.type === 'sms' && meta.phone) {
        const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
        const d = new Date(`${booking.date}T00:00:00`)
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        await sendSmsReminder(
          meta.phone,
          `Reminder: ${booking.dog_name}'s ${serviceName} appointment is today at ${formatTime(booking.start_time)} at ${booking.address}. — Dogs in Fashion`,
        )
      }

      await supabaseAdmin.from('reminders').update({ status: 'sent', sent_at: now }).eq('id', reminder.id)
    } catch (err) {
      console.error(`Failed to process reminder ${reminder.id}:`, err)
      await supabaseAdmin.from('reminders').update({ status: 'failed' }).eq('id', reminder.id)
    }
  }
}

// Start the scheduler interval (every 10 minutes)
export function startReminderScheduler(): void {
  console.log('Reminder scheduler started (every 10 min)')
  setInterval(processPendingReminders, 10 * 60 * 1000)
  // Also run once on startup
  processPendingReminders()
}
