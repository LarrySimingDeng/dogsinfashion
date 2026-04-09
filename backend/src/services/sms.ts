import twilio from 'twilio'
import { config } from '../config.js'
import type { Booking } from '../types.js'
import { SERVICE_NAMES } from '../data/services.js'

function getClient() {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_PHONE_NUMBER) {
    return null
  }
  return twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
}

export async function notifyDorisSms(booking: Booking): Promise<void> {
  const client = getClient()
  if (!client) return

  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  const d = new Date(`${booking.date}T00:00:00`)
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  try {
    await client.messages.create({
      body: `New booking: ${booking.dog_name} — ${serviceName}, ${dateStr} at ${formatTime(booking.start_time)}, ${booking.address}`,
      from: config.TWILIO_PHONE_NUMBER,
      to: config.DORIS_PHONE,
    })
  } catch (err) {
    console.error('Failed to send SMS to Doris:', err)
  }
}

export async function notifyDorisRescheduleSms(
  booking: Booking,
  oldDate: string,
  oldStartTime: string,
): Promise<void> {
  const client = getClient()
  if (!client) return

  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  const oldD = new Date(`${oldDate}T00:00:00`)
  const oldDateStr = oldD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const newD = new Date(`${booking.date}T00:00:00`)
  const newDateStr = newD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  try {
    await client.messages.create({
      body: `Rescheduled: ${booking.dog_name} — ${serviceName} moved from ${oldDateStr} ${formatTime(oldStartTime)} to ${newDateStr} ${formatTime(booking.start_time)}, ${booking.address}`,
      from: config.TWILIO_PHONE_NUMBER,
      to: config.DORIS_PHONE,
    })
  } catch (err) {
    console.error('Failed to send reschedule SMS to Doris:', err)
  }
}

export async function sendSmsReminder(phone: string, message: string): Promise<void> {
  const client = getClient()
  if (!client) return

  try {
    await client.messages.create({
      body: message,
      from: config.TWILIO_PHONE_NUMBER,
      to: phone,
    })
  } catch (err) {
    console.error('Failed to send SMS reminder:', err)
  }
}
