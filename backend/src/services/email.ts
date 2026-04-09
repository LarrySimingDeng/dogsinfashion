import nodemailer from 'nodemailer'
import { config } from '../config.js'
import type { Booking } from '../types.js'
import { SERVICE_NAMES, SERVICE_PRICES } from '../data/services.js'

function serviceDisplayName(serviceId: string): string {
  const name = SERVICE_NAMES[serviceId] ?? serviceId
  const price = SERVICE_PRICES[serviceId]
  return price ? `${name} ($${price})` : name
}

function getTransporter() {
  if (!config.SMTP_USER || !config.SMTP_PASS) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  })
}

function formatBookingDate(booking: Booking): string {
  const d = new Date(`${booking.date}T${booking.start_time}`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
}

function generateIcs(booking: Booking, clientEmail: string, sequence: number = 0): string {
  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  // Convert to UTC-compatible format: YYYYMMDDTHHMMSS
  const dtStart = `${booking.date.replace(/-/g, '')}T${booking.start_time.replace(/:/g, '')}00`
  const dtEnd = `${booking.date.replace(/-/g, '')}T${booking.end_time.replace(/:/g, '')}00`
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dogs in Fashion//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
    `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
    `DTSTAMP:${now}`,
    `UID:${booking.id}@dogsinfashion.com`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:Dogs in Fashion: ${serviceName} — ${booking.dog_name}`,
    `DESCRIPTION:Service: ${serviceName}\\nDog: ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}\\nAddress: ${booking.address}${booking.notes ? `\\nNotes: ${booking.notes}` : ''}`,
    `LOCATION:${booking.address}`,
    `ORGANIZER;CN=Dogs in Fashion:mailto:${config.DORIS_EMAIL}`,
    `ATTENDEE;CN=Client;RSVP=TRUE:mailto:${clientEmail}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Grooming appointment in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export async function sendBookingConfirmation(booking: Booking, clientEmail: string): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    const icsContent = generateIcs(booking, clientEmail)

    await transporter.sendMail({
      from: `"Dogs in Fashion" <${config.SMTP_USER}>`,
      to: clientEmail,
      subject: `Booking Confirmed — ${booking.dog_name} on ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#5BA4D9">Your Booking is Confirmed!</h2>
          <p>Hi there! Your grooming appointment has been confirmed:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#7A7570">Service</td><td style="padding:8px;font-weight:bold">${serviceName}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Dog</td><td style="padding:8px;font-weight:bold">${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Date</td><td style="padding:8px;font-weight:bold">${formatBookingDate(booking)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Time</td><td style="padding:8px;font-weight:bold">${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Address</td><td style="padding:8px;font-weight:bold">${booking.address}</td></tr>
          </table>
          <p>Doris will arrive at your location at the scheduled time. If you need to make changes, please visit <a href="https://www.dogsinfashion.com/my-bookings">My Bookings</a> or contact Doris directly.</p>
          <p style="color:#7A7570;font-size:14px">Doris — (916) 287-1878 — dogsinfashionca@gmail.com</p>
        </div>
      `,
      icalEvent: {
        method: 'REQUEST',
        content: icsContent,
      },
    })
  } catch (err) {
    console.error('Failed to send confirmation email:', err)
  }
}

export async function notifyDorisNewBooking(booking: Booking, clientEmail: string): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    await transporter.sendMail({
      from: `"Dogs in Fashion" <${config.SMTP_USER}>`,
      to: config.DORIS_EMAIL,
      subject: `New Booking: ${booking.dog_name} — ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#E8975E">New Booking!</h2>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Client Email:</strong> ${clientEmail}</p>
          ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to notify Doris:', err)
  }
}

export async function sendRescheduleNotification(
  booking: Booking,
  clientEmail: string,
  oldDate: string,
  oldStartTime: string,
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return

  const serviceName = serviceDisplayName(booking.service_id)
  const oldBooking = { ...booking, date: oldDate, start_time: oldStartTime }
  const oldDateDisplay = formatBookingDate(oldBooking)

  try {
    const icsContent = generateIcs(booking, clientEmail, 1)

    await transporter.sendMail({
      from: `"Dogs in Fashion" <${config.SMTP_USER}>`,
      to: clientEmail,
      subject: `Booking Rescheduled — ${booking.dog_name} on ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#5BA4D9">Your Booking Has Been Rescheduled</h2>
          <p>Hi there! Your grooming appointment has been updated to a new time:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#7A7570">Service</td><td style="padding:8px;font-weight:bold">${serviceName}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Dog</td><td style="padding:8px;font-weight:bold">${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">New Date</td><td style="padding:8px;font-weight:bold">${formatBookingDate(booking)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">New Time</td><td style="padding:8px;font-weight:bold">${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Previous</td><td style="padding:8px;color:#7A7570;text-decoration:line-through">${oldDateDisplay} at ${formatTime(oldStartTime)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Address</td><td style="padding:8px;font-weight:bold">${booking.address}</td></tr>
          </table>
          <p>If you have any questions, please visit <a href="https://www.dogsinfashion.com/my-bookings">My Bookings</a> or contact Doris directly.</p>
          <p style="color:#7A7570;font-size:14px">Doris — (916) 287-1878 — dogsinfashionca@gmail.com</p>
        </div>
      `,
      icalEvent: {
        method: 'REQUEST',
        content: icsContent,
      },
    })
  } catch (err) {
    console.error('Failed to send reschedule notification:', err)
  }
}

export async function notifyDorisReschedule(
  booking: Booking,
  clientEmail: string,
  oldDate: string,
  oldStartTime: string,
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return

  const serviceName = serviceDisplayName(booking.service_id)
  const oldBooking = { ...booking, date: oldDate, start_time: oldStartTime }
  const oldDateDisplay = formatBookingDate(oldBooking)

  try {
    await transporter.sendMail({
      from: `"Dogs in Fashion" <${config.SMTP_USER}>`,
      to: config.DORIS_EMAIL,
      subject: `Booking Rescheduled: ${booking.dog_name} — ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#E8975E">Booking Rescheduled</h2>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>New Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>New Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          <p style="color:#7A7570"><strong>Previous:</strong> ${oldDateDisplay} at ${formatTime(oldStartTime)}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Client Email:</strong> ${clientEmail}</p>
          ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to notify Doris about reschedule:', err)
  }
}

export async function sendReminderEmail(booking: Booking, clientEmail: string): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    await transporter.sendMail({
      from: `"Dogs in Fashion" <${config.SMTP_USER}>`,
      to: clientEmail,
      subject: `Reminder: ${booking.dog_name}'s grooming tomorrow!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#5BA4D9">Appointment Reminder</h2>
          <p>Just a friendly reminder about your upcoming grooming appointment:</p>
          <p><strong>${serviceName}</strong><br>${formatBookingDate(booking)} at ${formatTime(booking.start_time)}<br>${booking.address}</p>
          <p>See you soon! — Doris</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to send reminder email:', err)
  }
}
