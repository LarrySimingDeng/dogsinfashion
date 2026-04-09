import { supabaseAdmin } from './supabase.js'
import { getCalendarBusySlots } from './google-calendar.js'
import type { TimeSlot } from '../types.js'
import { SERVICE_DURATIONS } from '../data/services.js'

const SLOT_INTERVAL_MINUTES = 60

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function getAvailableSlots(date: string, serviceId: string, excludeBookingId?: string): Promise<TimeSlot[]> {
  const duration = SERVICE_DURATIONS[serviceId]
  if (!duration) return []

  const durationMinutes = duration * 60
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = dateObj.getDay() // 0=Sun, 1=Mon...

  // Check if blocked date
  const { data: blocked } = await supabaseAdmin
    .from('blocked_dates')
    .select('id')
    .eq('date', date)
    .limit(1)

  if (blocked && blocked.length > 0) return []

  // Get availability for this day
  const { data: availability } = await supabaseAdmin
    .from('availability')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)

  if (!availability || availability.length === 0) return []

  // Get existing bookings for this date (exclude current booking when rescheduling)
  let bookingsQuery = supabaseAdmin
    .from('bookings')
    .select('start_time, end_time')
    .eq('date', date)
    .neq('status', 'cancelled')

  if (excludeBookingId) {
    bookingsQuery = bookingsQuery.neq('id', excludeBookingId)
  }

  const { data: bookings } = await bookingsQuery

  // Merge DB bookings + Google Calendar busy times
  const calendarBusy = await getCalendarBusySlots(date)

  const busySlots = [
    ...(bookings ?? []).map(b => ({
      start: timeToMinutes(b.start_time),
      end: timeToMinutes(b.end_time),
    })),
    ...calendarBusy,
  ]

  const slots: TimeSlot[] = []

  for (const avail of availability) {
    const workStart = timeToMinutes(avail.start_time)
    const workEnd = timeToMinutes(avail.end_time)

    for (let start = workStart; start + durationMinutes <= workEnd; start += SLOT_INTERVAL_MINUTES) {
      const end = start + durationMinutes

      // Check for conflicts with existing bookings
      const hasConflict = busySlots.some(
        busy => start < busy.end && end > busy.start
      )

      if (!hasConflict) {
        slots.push({
          start: minutesToTime(start),
          end: minutesToTime(end),
        })
      }
    }
  }

  return slots
}
