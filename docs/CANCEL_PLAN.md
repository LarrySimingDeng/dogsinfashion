# Phase 6.5 — Cancel UX Hardening

> **Precedes Phase 7 (Payment)**. Must be completed and running stably in prod before the deposit feature begins.

## Context

Phase 7's deposit policy is "no refunds", which means cancellation must be an event that **makes both Doris and the customer clearly aware of what happened**. Otherwise this awkward situation arises: Doris clicks Cancel in the Admin panel → the customer knows nothing → the next day the customer is waiting to get their dog groomed → calls to complain → only then does Doris remember → refund or no refund?

So before building deposits, the cancellation flow must first be upgraded into a first-class citizen.

---

## Code Audit of the Current Cancel Flow

### Permissions
- **Backend** (`backend/src/routes/bookings.ts:186`): allows **owner or admin** to cancel
- **Frontend** (`MyBookingsPage.tsx:46-58`): the customer cancel UI is commented out ("we prefer customers not to self-cancel")
- **Contradiction**: the backend owner permission is effectively a dead permission—any customer hitting the endpoint directly with curl can cancel their own booking. This does not match the product intent.

### Calendar Sync
- `bookings.ts:204-206` calls `deleteCalendarEvent`, **fire-and-forget**
- The `deleteCalendarEvent` function in `google-calendar.ts:78-90` catches all errors internally and only logs them, never throwing
- In the failure scenario: the DB is already cancelled, but Doris's calendar still has the event hanging there, and the customer's calendar is not updated either

### Email Notification
- **No cancellation email at all**—grepping the entire `email.ts` finds no cancellation-related function
- The only way the customer can find out is by proactively opening MyBookingsPage to check the status
- Doris is the one clicking so she knows, but there is no archived email record

### Admin UI
- The Cancel button in `AdminDashboard.tsx:257-263` **fires the request on a single click**, with no secondary confirmation
- Doris misclicking by accident = a real cancel, with no way to undo

---

## Design Decisions

### Decision 1: Only admin can cancel (lock down backend permissions)
Remove the owner escape route. In the future, if we want to support customer self-cancellation, route it through a separate endpoint + business rules (e.g. "cannot cancel within 48 hours"); do not mix it with admin cancel.

### Decision 2: Send the customer an email after cancellation (with a CANCEL ics attachment)
Let the customer's calendar (Gmail / Apple / Outlook) automatically mark the event as cancelled, without requiring manual action from the customer. Key ics fields:
- `METHOD:CANCEL` (not REQUEST)
- `STATUS:CANCELLED`
- `SEQUENCE:999` (higher than the sequence of any previously sent invite, to force an override)

### Decision 3: Send Doris an archive email after cancellation
For audit records. In future customer disputes, searching the mailbox is more convenient than querying the database.

### Decision 4: Change `deleteCalendarEvent` from fire-and-forget to await + no rollback on failure
- The caller `await`s execution, and the function throws internally on failure so the caller is aware
- A 404 (event not found) is treated as success (idempotent handling)
- Other errors are logged at error level, but **do not roll back the DB's cancelled status**—once cancelled is cancelled, calendar inconsistency is a secondary concern

### Decision 5: Add a confirm dialog to the AdminDashboard Cancel button
The Phase 6.5 copy has only a basic prompt; after Phase 7 is complete, the dialog will add a "deposit is non-refundable" reminder (a defensive check is reserved in the code).

### Decision 6: Clean up the commented-out cancel dead code in `MyBookingsPage`
Do not keep "might be used later" code. Write new code if needed.

---

## 1. Backend Changes

### 1.1 `backend/src/routes/bookings.ts` — Rewrite the Cancel endpoint

Modify the cancel branch of `PATCH /:id/status`:

**Tighten permissions** (replace lines 186-189):
```ts
// old
if (parsed.data.status === 'cancelled' && booking.user_id !== req.user!.id && req.user!.role !== 'admin') {
  res.status(403).json({ error: 'Access denied' })
  return
}

// new
if (parsed.data.status === 'cancelled' && req.user!.role !== 'admin') {
  res.status(403).json({ error: 'Only admin can cancel bookings' })
  return
}
```

**Post-cancellation side-effect flow** (replace the crude handling at lines 203-211):
```ts
// 1. The DB update is already done above (it's the existing const { data: updated } = ...)

// Only execute the side effects below when status goes from confirmed → cancelled
if (parsed.data.status === 'cancelled') {
  // 2. Fetch the customer email (admin may != booking owner)
  let clientEmail = req.user!.email
  if (booking.user_id !== req.user!.id) {
    try {
      const { data: { user: clientUser } } = await supabaseAdmin.auth.admin.getUserById(booking.user_id)
      if (clientUser?.email) clientEmail = clientUser.email
    } catch (err) {
      console.error('[cancel] failed to fetch client email:', err)
    }
  }

  // 3. AWAIT the Google Calendar deletion
  if (booking.google_event_id) {
    try {
      await deleteCalendarEvent(booking.google_event_id)
    } catch (err) {
      console.error('[cancel] calendar delete failed', {
        bookingId: booking.id,
        eventId: booking.google_event_id,
        err,
      })
      // Do not roll back the DB; calendar inconsistency is a secondary concern
    }
  }

  // 4. AWAIT cancelling reminders
  try {
    await cancelReminders(booking.id)
  } catch (err) {
    console.error('[cancel] cancel reminders failed', { bookingId: booking.id, err })
  }

  // 5. Fire-and-forget email notifications
  sendCancellationNotification(updated, clientEmail)
    .catch(err => console.error('[cancel] customer email failed:', err))
  notifyDorisCancellation(updated, clientEmail)
    .catch(err => console.error('[cancel] Doris email failed:', err))
}

res.json(updated)
```

Remember to import the new functions at the top of the file:
```ts
import {
  sendBookingConfirmation,
  notifyDorisNewBooking,
  sendRescheduleNotification,
  notifyDorisReschedule,
  sendCancellationNotification,     // new
  notifyDorisCancellation,           // new
} from '../services/email.js'
```

### 1.2 `backend/src/services/email.ts` — Add two functions + `generateIcs` support for CANCEL

**Refactor `generateIcs`** (currently lines 32-65) to support the CANCEL method:

```ts
function generateIcs(
  booking: Booking,
  clientEmail: string,
  options: { method?: 'REQUEST' | 'CANCEL'; sequence?: number } = {},
): string {
  const method = options.method ?? 'REQUEST'
  const sequence = options.sequence ?? 0
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'

  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  const dtStart = `${booking.date.replace(/-/g, '')}T${booking.start_time.replace(/:/g, '')}00`
  const dtEnd = `${booking.date.replace(/-/g, '')}T${booking.end_time.replace(/:/g, '')}00`
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dogs in Fashion//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
    `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
    `DTSTAMP:${now}`,
    `UID:${booking.id}@dogsinfashion.com`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:Dogs in Fashion: ${serviceName} — ${booking.dog_name}`,
    `DESCRIPTION:Service: ${serviceName}\\nDog: ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}\\nAddress: ${booking.address}`,
    `LOCATION:${booking.address}`,
    `ORGANIZER;CN=Dogs in Fashion:mailto:${config.DORIS_EMAIL}`,
    `ATTENDEE;CN=Client;RSVP=TRUE:mailto:${clientEmail}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
```

Also update the three existing call sites (`sendBookingConfirmation`, `sendRescheduleNotification`) to use the new signature. The original behavior is unchanged, only the parameters become an options object.

**Add `sendCancellationNotification`** (place it after `notifyDorisReschedule`):
```ts
export async function sendCancellationNotification(
  booking: Booking,
  clientEmail: string,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    // sequence is set to 999 to ensure it overrides any previously sent invite/update
    const icsContent = generateIcs(booking, clientEmail, { method: 'CANCEL', sequence: 999 })

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: clientEmail,
      replyTo: config.DORIS_EMAIL,
      subject: `Booking Cancelled — ${booking.dog_name} on ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#B84A4A">Your Booking Has Been Cancelled</h2>
          <p>Hi there! Unfortunately, your grooming appointment has been cancelled:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#7A7570">Service</td><td style="padding:8px;font-weight:bold">${serviceName}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Dog</td><td style="padding:8px;font-weight:bold">${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Date</td><td style="padding:8px;font-weight:bold">${formatBookingDate(booking)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Time</td><td style="padding:8px;font-weight:bold">${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</td></tr>
          </table>
          <p>If you'd like to reschedule or have any questions, please contact Doris directly or <a href="https://www.dogsinfashion.com/book">book a new appointment</a>.</p>
          <p style="color:#7A7570;font-size:14px">Doris — (916) 287-1878 — contact@dogsinfashion.com</p>
        </div>
      `,
      attachments: [icsAttachment(icsContent)],
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to send cancellation notification:', err)
  }
}
```

**Add `notifyDorisCancellation`**:
```ts
export async function notifyDorisCancellation(
  booking: Booking,
  clientEmail: string,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.DORIS_EMAIL,
      replyTo: clientEmail,
      subject: `Booking Cancelled: ${booking.dog_name} — ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#B84A4A">Booking Cancelled (Archive)</h2>
          <p>This booking has been cancelled:</p>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Client Email:</strong> ${clientEmail}</p>
          <p style="color:#7A7570;font-size:13px;margin-top:16px">Customer has been notified via email. Google Calendar event has been removed.</p>
        </div>
      `,
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to notify Doris about cancellation:', err)
  }
}
```

### 1.3 `backend/src/services/google-calendar.ts` — Make `deleteCalendarEvent` throw on error

The current function (lines 78-90) swallows all errors. Change it to:
```ts
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!calendar || !eventId) return

  try {
    await calendar.events.delete({
      calendarId: config.DORIS_CALENDAR_ID,
      eventId,
      sendUpdates: 'all',
    })
  } catch (err: any) {
    // 404 = event already gone, treat as success (idempotent)
    if (err?.code === 404 || err?.response?.status === 404) {
      console.warn('[calendar] event already deleted or not found:', eventId)
      return
    }
    // Throw other errors for the caller to handle
    throw err
  }
}
```

**Note**: Will this affect the `updateCalendarEvent` fallback logic in the reschedule flow in `bookings.ts`? No—that flow calls `updateCalendarEvent`, not `deleteCalendarEvent`; they are independent functions.

---

## 2. Frontend Changes

### 2.1 `frontend/src/pages/AdminDashboard.tsx` — Add a confirm dialog to the Cancel button

Modify lines 257-263:
```tsx
<button
  onClick={async () => {
    // After deposits go live in Phase 7, the deposit_status field will take effect.
    // In the current Phase 6.5 stage this field does not exist yet, so the defensive check will not trigger.
    const hasDeposit = (b as unknown as { deposit_status?: string }).deposit_status === 'paid'
    const dateStr = new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
    const msg = hasDeposit
      ? `Cancel ${b.dog_name}'s booking on ${dateStr}?\n\n⚠️ This booking has a $20 non-refundable deposit. Cancelling will NOT automatically refund. To refund, do it manually in Square dashboard.\n\nThe customer will be notified by email.`
      : `Cancel ${b.dog_name}'s booking on ${dateStr}?\n\nThe customer will be notified by email.`
    if (!confirm(msg)) return
    await updateStatus(b.id, 'cancelled')
  }}
  disabled={updatingIds.has(b.id)}
  className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
>
  Cancel
</button>
```

### 2.2 `frontend/src/pages/MyBookingsPage.tsx` — Delete the dead code

Delete the entire comment block at lines 46-58 (from `// Cancel functionality disabled ...` to `// }`).

---

## 3. File Change List

### Modified files (4 total, no new files created)
- `backend/src/routes/bookings.ts` — Tighten cancel permissions + await side-effect flow
- `backend/src/services/email.ts` — `generateIcs` support for CANCEL method + add 2 functions
- `backend/src/services/google-calendar.ts` — Make `deleteCalendarEvent` throw on error (except 404)
- `frontend/src/pages/AdminDashboard.tsx` — Cancel button confirm dialog
- `frontend/src/pages/MyBookingsPage.tsx` — Delete dead code

---

## 4. Test Checklist

### Functional tests (dev environment)
- [ ] **Happy path**: create a booking → Admin cancel → customer receives a cancellation email (subject contains "Cancelled") → email attachment is a CANCEL ics
- [ ] **Customer calendar sync**: after opening the email attachment, the corresponding event in Gmail / Apple Calendar automatically disappears or is marked as cancelled
- [ ] **Doris archive email**: after the same operation, `DORIS_EMAIL` receives an archive email
- [ ] **Doris calendar sync**: manually confirm at calendar.google.com that the original event was deleted
- [ ] **Reminder cancellation**: Admin cancels a booking within 24 hours, and the reminder that would have been sent is no longer sent (can be confirmed via the `reminders` table or the logs)
- [ ] **Confirm dialog**: in AdminDashboard click Cancel → dialog pops up → click "Cancel" → no side effects at all → click again → click "Confirm" → normal flow
- [ ] **Success toast**: after a successful Cancel, AdminDashboard shows the "Booking cancelled successfully" toast (existing behavior, regression test)

### Permission tests
- [ ] **Owner cannot cancel (backend)**: log in with a customer account, curl `PATCH /api/bookings/:id/status` passing `{ "status": "cancelled" }` → returns **403 "Only admin can cancel bookings"**
- [ ] **Owner cannot complete**: the same curl passing `{ "status": "completed" }` → returns **403** (existing behavior, regression test)
- [ ] **No cancel entry in MyBookings**: customer logs into the MyBookings page, and the cancel button is **completely invisible** in the UI

### Boundary tests
- [ ] **Calendar event does not exist**: manually change a booking's `google_event_id` in Supabase to a fake value `fake-event-123` → Admin cancel → DB succeeds → email succeeds → logs have a warn but not an error
- [ ] **Already cancelled, cancel again**: click Cancel again on a booking with `status='cancelled'` → idempotent handling, no crash, no duplicate email (the backend already has a status check, regression)
- [ ] **Calendar API 500**: temporarily set `GOOGLE_SERVICE_ACCOUNT_KEY` to invalid JSON → Admin cancel → DB update succeeds, email is still sent, logs an error but does not crash

### Integration tests
- [ ] **Cancel → time slot released**: after cancellation, the same time slot can be occupied by another booking
- [ ] **Cancel → MyBookings display**: this booking shows a "Cancelled" badge on the customer's MyBookingsPage

---

## 5. Rollout (in order, stop and confirm after each step)

1. **Backend changes** (1.1 + 1.2 + 1.3) → local `npm run dev`
2. **Test cancel with curl**:
   - Create a booking (using an admin account)
   - `curl -X PATCH http://localhost:3001/api/bookings/<id>/status -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"status":"cancelled"}'`
   - Confirm DB + calendar + two emails
3. **Verify the CANCEL ics is parsed correctly by email clients**: open the email attachment in Gmail web, confirm Gmail shows "This event has been cancelled"
4. **Frontend changes** (2.1 + 2.2) → test the AdminDashboard confirm dialog in a local browser
5. **Run through the full test checklist** (§4)
6. **⛔ Stop and let Larry manually confirm all tests pass**
7. **Deploy to prod**: Railway redeploy backend → Vercel redeploy frontend
8. **Prod smoke test**: create a test booking with a real account → admin cancel → verify the email arrives + Calendar syncs

---

## 6. Hand-off Points with Phase 7

After Phase 6.5 is complete, Phase 7 will extend it in the following places:
- The confirm dialog copy in `AdminDashboard.tsx`: the `hasDeposit` check will take effect automatically (when Phase 7 adds the `deposit_status` field, no code change is needed here)
- The `sendCancellationNotification` function: Phase 7 will add a "deposit is non-refundable" reminder to the email HTML (when `booking.deposit_status === 'paid'`)
- The `bookings.ts` cancel flow: Phase 7 will **not** automatically refund the Square charge; a forfeited deposit is forfeited, and this is the design intent

---

## 7. Out of Scope

- Customer self-cancellation UI
- Cancellation reason dropdown ("customer request" / "weather" / "Doris sick")
- Automatic refunds (the deposit policy is simply no refunds)
- Bulk cancellation
- Cancellation history audit table (for now it relies on bookings.updated_at and emails)
- Automatically suggesting rebooking after cancellation
