import { supabaseAdmin } from '../services/supabase.js'
import { createCalendarEvent } from '../services/google-calendar.js'
import type { Booking } from '../types.js'

/**
 * Sync missing calendar events.
 * Finds confirmed bookings with no google_event_id and creates calendar events for them.
 * Runs periodically to recover from any failed calendar creations.
 */
export async function syncMissingCalendarEvents(): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  // Find confirmed bookings with no calendar event, from today onwards
  const { data: bookings, error } = await supabaseAdmin
    .from('bookings')
    .select('*, profiles(name, phone)')
    .is('google_event_id', null)
    .eq('status', 'confirmed')
    .gte('date', today)

  if (error || !bookings || bookings.length === 0) return

  console.log(`Calendar sync: ${bookings.length} booking(s) missing calendar events`)

  for (const row of bookings) {
    const booking = row as unknown as Booking
    try {
      // Re-check if google_event_id is still null (avoid race with fire-and-forget creation)
      const { data: fresh } = await supabaseAdmin
        .from('bookings')
        .select('google_event_id')
        .eq('id', booking.id)
        .single()

      if (fresh?.google_event_id) {
        console.log(`Calendar sync: booking ${booking.id} already has event, skipping`)
        continue
      }

      // Get client email from auth.users
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(booking.user_id)
      const clientEmail = user?.email

      const eventId = await createCalendarEvent(booking, clientEmail ?? undefined)
      if (eventId) {
        await supabaseAdmin
          .from('bookings')
          .update({ google_event_id: eventId })
          .eq('id', booking.id)
        console.log(`Calendar sync: created event for booking ${booking.id}`)
      }
    } catch (err) {
      console.error(`Calendar sync: failed for booking ${booking.id}:`, err)
    }
  }
}

export function startCalendarSync(): void {
  console.log('Calendar sync started (every 5 min)')
  // Run once on startup
  syncMissingCalendarEvents()
  // Then every 5 minutes
  setInterval(syncMissingCalendarEvents, 5 * 60 * 1000)
}
