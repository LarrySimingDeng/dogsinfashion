import { google } from 'googleapis'
import { config } from '../config.js'
import type { Booking } from '../types.js'
import { SERVICE_NAMES } from '../data/services.js'

function getCalendarClient() {
  if (!config.GOOGLE_SERVICE_ACCOUNT_KEY) return null

  try {
    const key = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_KEY)
    const auth = new google.auth.JWT(
      key.client_email,
      undefined,
      key.private_key,
      ['https://www.googleapis.com/auth/calendar'],
    )
    return google.calendar({ version: 'v3', auth })
  } catch {
    console.warn('Failed to initialize Google Calendar client')
    return null
  }
}

const calendar = getCalendarClient()

const normTime = (t: string) => t.length === 5 ? `${t}:00` : t

function buildEventDescription(booking: Booking, clientEmail?: string): string {
  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  return [
    `Service: ${serviceName}`,
    `Dog: ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}`,
    `Address: ${booking.address}`,
    booking.notes ? `Notes: ${booking.notes}` : '',
    clientEmail ? `Client: ${clientEmail}` : '',
    '',
    'Booked via dogsinfashion.com',
  ].filter(Boolean).join('\n')
}

export async function createCalendarEvent(
  booking: Booking,
  clientEmail?: string,
): Promise<string | null> {
  if (!calendar) return null

  try {
    const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
    const startDateTime = `${booking.date}T${normTime(booking.start_time)}`
    const endDateTime = `${booking.date}T${normTime(booking.end_time)}`
    const description = buildEventDescription(booking, clientEmail)

    const event = await calendar.events.insert({
      calendarId: config.DORIS_CALENDAR_ID,
      requestBody: {
        summary: `Dogs in Fashion: ${serviceName} — ${booking.dog_name}`,
        description,
        location: booking.address,
        start: { dateTime: startDateTime, timeZone: 'America/Los_Angeles' },
        end: { dateTime: endDateTime, timeZone: 'America/Los_Angeles' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'email', minutes: 1440 },
          ],
        },
      },
    })

    return event.data.id ?? null
  } catch (err) {
    console.error('Failed to create calendar event:', err)
    return null
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!calendar || !eventId) return

  try {
    await calendar.events.delete({
      calendarId: config.DORIS_CALENDAR_ID,
      eventId,
      sendUpdates: 'all',
    })
  } catch (err) {
    console.error('Failed to delete calendar event:', err)
  }
}

export async function updateCalendarEvent(
  eventId: string,
  booking: Booking,
  clientEmail?: string,
): Promise<boolean> {
  if (!calendar || !eventId) return true

  try {
    const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
    const startDateTime = `${booking.date}T${normTime(booking.start_time)}`
    const endDateTime = `${booking.date}T${normTime(booking.end_time)}`
    const description = buildEventDescription(booking, clientEmail)

    console.log('[calendar] patching event:', eventId, '| start:', startDateTime, '| end:', endDateTime)
    await calendar.events.patch({
      calendarId: config.DORIS_CALENDAR_ID,
      eventId,
      sendUpdates: 'all',
      requestBody: {
        summary: `Dogs in Fashion: ${serviceName} — ${booking.dog_name}`,
        description,
        location: booking.address,
        start: { dateTime: startDateTime, timeZone: 'America/Los_Angeles' },
        end: { dateTime: endDateTime, timeZone: 'America/Los_Angeles' },
      },
    })
    console.log('[calendar] patch success for event:', eventId)
    return true
  } catch (err) {
    console.error('[calendar] patch FAILED for event:', eventId, err)
    return false
  }
}

export async function getCalendarBusySlots(
  dateStr: string,
): Promise<Array<{ start: number; end: number }>> {
  if (!calendar) return []

  try {
    const timeMin = `${dateStr}T00:00:00-08:00`
    const timeMax = `${dateStr}T23:59:59-08:00`

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: 'America/Los_Angeles',
        items: [{ id: config.DORIS_CALENDAR_ID }],
      },
    })

    const busy = res.data.calendars?.[config.DORIS_CALENDAR_ID]?.busy ?? []
    return busy.map((b: { start?: string | null; end?: string | null }) => {
      const s = new Date(b.start!)
      const e = new Date(b.end!)
      return {
        start: s.getHours() * 60 + s.getMinutes(),
        end: e.getHours() * 60 + e.getMinutes(),
      }
    })
  } catch (err) {
    console.error('Failed to fetch calendar busy slots:', err)
    return []
  }
}
