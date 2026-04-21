import { sendThankYouEmail } from '../src/services/email.js'
import type { Booking } from '../src/types.js'

const to = process.argv[2]
if (!to) {
  console.error('Usage: npx tsx scripts/send-test-thankyou.ts <email-address>')
  process.exit(1)
}

const fakeBooking: Booking = {
  id: 'test-booking-id',
  user_id: 'test-user-id',
  service_id: 'bath-small',
  date: '2026-04-21',
  start_time: '10:00',
  end_time: '11:00',
  dog_name: 'Mochi',
  dog_breed: 'Shiba Inu',
  phone: null,
  address: '123 Test St',
  notes: null,
  status: 'completed',
  google_event_id: null,
  deposit_status: 'none',
  deposit_paid_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

await sendThankYouEmail(fakeBooking, to)
console.log(`Test thank-you email dispatched to ${to}. Check inbox (and spam).`)
