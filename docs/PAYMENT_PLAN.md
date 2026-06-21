# Phase 7 — Mandatory Deposit (Square Payments)

> **Prerequisite**: `CANCEL_PLAN.md` must be completed first and run stably in prod.

## Context

The Dogs in Fashion booking flow currently collects no money at all. Larry wants to integrate Square so that customers pay a $20 deposit up front to lock in their time slot when booking, with the remaining balance collected on grooming day either in cash or by swiping a card on-site via Square.

### Key business decisions (finalized after a full round of plan review)

1. **The deposit is mandatory, not optional**
   The old plan once considered an "optional deposit + Skip button", but after discussion it was determined that: **an optional deposit = a tip**, which has no binding force against no-shows and cannot filter out fake customers without payment ability. The business value of the deposit (commitment device + fraud filter) only holds when it is mandatory. So we cut the optional middle state and keep only **two states**:
   - `off` (current + promotion period): collects no deposit at all, exactly the same as now
   - `required` (flip the flag two months later): a deposit must be paid to book; failure = the booking does not go through

2. **Deposit policy**: **non-refundable**. It serves as an explicit cancellation fee. If Doris wants to refund a special case, she does it manually herself in the Square dashboard.

3. **Collection timing**: pay the $20 deposit at booking time; the remaining balance is collected on-site on grooming day.

4. **Payment flow**: atomic transaction — `POST /api/bookings/with-deposit` **charges Square first, then inserts the booking**; a failure at any step rolls back.

5. **Integration method**: Square Web Payments SDK embedded card-number form (iframe fields, PCI SAQ-A compliant)

6. **Feature flag**: a single boolean `DEPOSIT_REQUIRED`; two months later, once Doris is ready, Larry changes two environment variables + redeploys both sides to enable it.

---

## 1. Feature Flag Design

### Backend env (`backend/src/config.ts`)
```ts
// Square Payments (optional + feature-flagged)
// ⚠️ DEPOSIT_REQUIRED must use enum+transform, not z.coerce.boolean()
// because Boolean("false") === true (every non-empty string is truthy)
DEPOSIT_REQUIRED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
DEPOSIT_AMOUNT_CENTS: z.coerce.number().int().positive().default(2000),
SQUARE_ACCESS_TOKEN: z.string().optional(),
SQUARE_APPLICATION_ID: z.string().optional(),
SQUARE_LOCATION_ID: z.string().optional(),
SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
LARRY_ALERT_EMAIL: z.string().email().optional(),  // recipient of critical error alerts
```

### Frontend env (Vite)
```
VITE_DEPOSIT_REQUIRED=false   # off by default
VITE_DEPOSIT_AMOUNT_CENTS=2000
VITE_SQUARE_APPLICATION_ID=...
VITE_SQUARE_LOCATION_ID=...
VITE_SQUARE_ENVIRONMENT=sandbox
```

**The frontend check must use string comparison** (Vite's `import.meta.env.VITE_*` are all strings):
```ts
const depositRequired = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'
```

### Two-state behavior matrix

| Flag state | Frontend BookingPage | Backend `POST /api/bookings` | Backend `POST /api/bookings/with-deposit` |
|---|---|---|---|
| `DEPOSIT_REQUIRED=false` (default) | No deposit UI, Confirm button = "Confirm Booking" | **Enabled**, same as now | Returns 503 `Payments not enabled` |
| `DEPOSIT_REQUIRED=true` + Square fully configured | Confirm step embeds the Square card form, button = "Pay $20 & Confirm" | **Returns 503** `Deposit required, use /with-deposit` | Enabled, handled as an atomic transaction |
| `DEPOSIT_REQUIRED=true` but Square env missing | No deposit UI shown (fail-safe degradation) | Same as above | Returns 503 `Payments temporarily unavailable` |

### Enablement steps (two months later)
1. Doris tells Larry to go live with the deposit
2. Larry sets `DEPOSIT_REQUIRED=true` on Railway and `VITE_DEPOSIT_REQUIRED=true` on Vercel
3. Redeploy each side once
4. Larry books 1 order himself with a real card as a $1 test (temporarily change `DEPOSIT_AMOUNT_CENTS=100`) → confirm Square received it → refund from the Square dashboard → restore `DEPOSIT_AMOUNT_CENTS=2000`
5. Done

### Rollback steps (if something goes wrong)
Change both flags back to `false` + redeploy, **a minute-scale rollback, with no code changes needed**.

---

## 2. Data Model

### New table `payments` (audit + reference for future refunds)
```sql
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null default 'deposit'
    check (type in ('deposit', 'balance', 'refund')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD',
  status text not null default 'paid'
    check (status in ('paid', 'refunded')),
  square_payment_id text unique,
  square_receipt_url text,
  paid_at timestamptz not null default now(),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_payments_booking on payments(booking_id);
```

**Key differences compared to the v1 plan**:
- ❌ No `'pending'` / `'processing'` / `'failed'` status — under the atomic flow these states never appear in the DB (failure = nothing was inserted at all)
- ❌ No `failure_reason` column — same as above
- ✅ Added a `'refund'` type reserved for the future
- ✅ Simplified to two states, `paid` / `refunded`

### RLS policy
```sql
alter table payments enable row level security;

create policy "Users view own payments" on payments for select using (
  exists (select 1 from bookings b
          where b.id = payments.booking_id and b.user_id = auth.uid())
);
```

**Note**: there is no "admin views all" policy, because the backend uses `supabaseAdmin` (service role key) entirely to bypass RLS. The admin view goes directly through the backend API, not through PostgREST.

### 2 new columns added to the `bookings` table
```sql
alter table bookings add column deposit_status text not null default 'none'
  check (deposit_status in ('none', 'paid', 'refunded'));
alter table bookings add column deposit_paid_at timestamptz;
```

**Status simplification**:
- `'none'`: all bookings when flag=off / the special case where flag=on but Doris handled it manually in the Square dashboard
- `'paid'`: the default status of all normal bookings when flag=on
- `'refunded'`: after Doris manually refunds a special case, she (or Larry) changes this field in the admin UI or via SQL

### Migration file
The repo has no `supabase/migrations/` directory. Following the existing `mock-data.sql` pattern, create a new `2026-04-XX-payments.sql` at the repo root (replace XX with the actual date), which Larry runs manually via Supabase Dashboard → SQL Editor (once each for dev and prod).

---

## 3. Backend Changes

### 3.1 `backend/src/config.ts` — add 7 new env vars
See §1. While at it, clean up the leftover Stripe placeholders in `.env.example` (`VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and replace them with the Square equivalents.

### 3.2 New file `backend/src/services/square.ts`

**Dependency**: `cd backend && npm install square@^44.0.0`
**Current version**: `44.0.1` (the latest found when implementing on 2026-04-10). The code below was cross-checked against the TypeScript definitions in `node_modules/square/api/**/*.d.ts`, and the API shape aligns with the actual v44.x SDK.

**Key facts about the v44 SDK** (all confirmed from the `.d.ts` source files):
- `import { SquareClient, SquareEnvironment, SquareError } from 'square'`
- `SquareEnvironment` is no longer a true enum; it is a const object, and `.Production` / `.Sandbox` are URL string constants (in use you still write `SquareEnvironment.Sandbox`)
- `new SquareClient({ token, environment })` constructor
- `client.payments.create({ sourceId, idempotencyKey, amountMoney: { amount: BigInt, currency }, locationId, autocomplete, referenceId, note })` — all fields camelCase
- `client.refunds.refundPayment({ idempotencyKey, paymentId, amountMoney, reason })`
- The return type is `HttpResponsePromise<T> extends Promise<T>`, so `await` directly yields the parsed response, with no need for `.withRawResponse()`
- Response shape: `CreatePaymentResponse.payment?: Payment`, and `Payment` has `.id` / `.status` / `.receiptUrl` / `.orderId` / `.referenceId` / `.amountMoney` (all camelCase)
- Errors throw a `SquareError` instance, which has `.errors: BodyError[]` (each `BodyError` has `.detail` / `.code` / `.category` / `.field`) + `.message` + `.statusCode` + `.body` + `.rawResponse`

**Must do when upgrading the major version**: run `npm view square version` to check whether it has reached v45+. If so, re-check the field names against `node_modules/square/api/resources/payments/client/Client.d.ts` and `api/resources/refunds/client/Client.d.ts` (compatibility is not guaranteed between major versions). Afterward run `npx tsc --noEmit`.

```ts
import { config } from '../config.js'

// Type-only import: the real SDK is dynamically imported only on the first call,
// so a flag=off deploy never loads the square package.
type SquareClient = import('square').SquareClient

let clientPromise: Promise<SquareClient> | null = null

async function getSquareClient(): Promise<SquareClient | null> {
  if (!isSquareConfigured()) return null
  if (clientPromise) return clientPromise

  clientPromise = (async () => {
    const { SquareClient, SquareEnvironment } = await import('square')
    return new SquareClient({
      token: config.SQUARE_ACCESS_TOKEN!,
      environment:
        config.SQUARE_ENVIRONMENT === 'production'
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    })
  })()

  return clientPromise
}

export function isSquareConfigured(): boolean {
  return !!(
    config.DEPOSIT_REQUIRED &&
    config.SQUARE_ACCESS_TOKEN &&
    config.SQUARE_APPLICATION_ID &&
    config.SQUARE_LOCATION_ID
  )
}

/**
 * Extract a human-readable error message from a Square SDK failure.
 * v44 throws `SquareError` instances with `.errors[]` of `{ category, code, detail }`.
 * Duck-typed so we don't need a static import of the SquareError class
 * (which would defeat dynamic import on flag=off deploys).
 */
function extractSquareErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { errors?: Array<{ detail?: string; code?: string }>; message?: string }
    const first = e.errors?.[0]
    if (first?.detail) return first.detail
    if (first?.code) return first.code
    if (e.message) return e.message
  }
  return 'Unknown Square error'
}

export async function createSquarePayment(params: {
  sourceId: string
  amountCents: number
  idempotencyKey: string
  referenceId: string  // the caller passes the pre-generated booking id, used as the 1:1 reconciliation identifier between Square ↔ DB
  note: string
}): Promise<{
  squarePaymentId: string
  receiptUrl: string | null
  orderId: string | null
}> {
  const client = await getSquareClient()
  if (!client) throw new Error('Square not configured')

  try {
    const response = await client.payments.create({
      sourceId: params.sourceId,
      idempotencyKey: params.idempotencyKey,
      amountMoney: {
        // ⚠️ Must be BigInt. Passing a Number throws at runtime.
        amount: BigInt(params.amountCents),
        currency: 'USD',
      },
      locationId: config.SQUARE_LOCATION_ID!,
      // Synchronous capture — no separate CAPTURE step needed.
      autocomplete: true,
      referenceId: params.referenceId,
      note: params.note,
    })

    const payment = response.payment
    if (!payment || payment.status !== 'COMPLETED') {
      throw new Error(`Square payment not completed: ${payment?.status ?? 'unknown'}`)
    }

    return {
      squarePaymentId: payment.id!,
      receiptUrl: payment.receiptUrl ?? null,
      orderId: payment.orderId ?? null,
    }
  } catch (err) {
    throw new Error(extractSquareErrorMessage(err))
  }
}

export async function refundSquarePayment(
  squarePaymentId: string,
  idempotencyKey: string,
): Promise<{ refundId: string }> {
  const client = await getSquareClient()
  if (!client) throw new Error('Square not configured')

  try {
    const response = await client.refunds.refundPayment({
      idempotencyKey,
      paymentId: squarePaymentId,
      amountMoney: {
        amount: BigInt(config.DEPOSIT_AMOUNT_CENTS),
        currency: 'USD',
      },
      reason: 'Booking creation failed after charge',
    })

    const refund = response.refund
    if (!refund?.id) {
      throw new Error('Refund response missing id')
    }
    return { refundId: refund.id }
  } catch (err) {
    throw new Error(extractSquareErrorMessage(err))
  }
}
```

**3 small improvements applied during implementation** (applied after confirming the v44 shape on 2026-04-10):
1. The `squareClient` cache changed from a singleton `any` variable to a `Promise<SquareClient>`, to avoid a duplicate dynamic import on concurrent first calls
2. The type changed from `any` to a **type-only import** of `import('square').SquareClient`, retaining the flag-off lazy loading while getting back TS type hints
3. Error handling extracted into a standalone `extractSquareErrorMessage()` helper, with a 3-level fallback (`detail` → `code` → `message`) instead of 2 levels

### 3.3 `backend/src/routes/bookings.ts` — add the atomic endpoint + a guard on the old endpoint

**a) Add one guard line to the existing `POST /` (i.e. `POST /api/bookings`)** (placed after `requireAuth`, before Zod validation):
```ts
bookingsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  // 🛡 Feature flag guard
  if (config.DEPOSIT_REQUIRED) {
    res.status(503).json({ error: 'Deposit required. Use /api/bookings/with-deposit' })
    return
  }

  // ... existing logic unchanged ...
})
```

**b) Add `POST /with-deposit`** placed after `POST /`:
```ts
import { randomUUID } from 'crypto'
import { createSquarePayment, refundSquarePayment, isSquareConfigured } from '../services/square.js'
import { notifyDorisDepositPaid, notifyLarryCriticalError } from '../services/email.js'

bookingsRouter.post('/with-deposit', requireAuth, async (req: AuthRequest, res) => {
  // 🛡 Short-circuit guards
  if (!config.DEPOSIT_REQUIRED) {
    res.status(503).json({ error: 'Deposits not enabled. Use /api/bookings' })
    return
  }
  if (!isSquareConfigured()) {
    res.status(503).json({ error: 'Payments temporarily unavailable' })
    return
  }

  // Zod validation
  const schema = z.object({
    service_id: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    dog_name: z.string().min(1),
    dog_breed: z.string().optional(),
    address: z.string().min(1),
    notes: z.string().optional(),
    source_id: z.string().min(1),         // Square Web SDK token
    idempotency_key: z.string().uuid(),   // UUID generated by the client
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { service_id, date, start_time, dog_name, dog_breed, address, notes, source_id, idempotency_key } = parsed.data

  const duration = SERVICE_DURATIONS[service_id]
  if (!duration) {
    res.status(400).json({ error: 'Invalid service_id' })
    return
  }

  const end_time = addMinutesToTime(start_time, duration * 60)

  // Step 1: check the slot is available (pre-check, to avoid charging for an obviously impossible booking)
  const available = await getAvailableSlots(date, service_id)
  if (!available.some(s => s.start === start_time)) {
    res.status(409).json({ error: 'This time slot is no longer available' })
    return
  }

  // Generate the booking id ahead of time, then pass it both to Square as the reference_id and explicitly as the id at insert.
  // This keeps Square dashboard ↔ bookings table as a clean 1:1 mapping (in the Square back office Doris sees
  // a payment whose reference_id is the full booking id, which she can look up directly).
  const bookingId = randomUUID()

  // Step 2: call the Square charge (after this step the customer's money has already been charged)
  // ⚠️ Square API field length limits (a gotcha hit during implementation, 2026-04-10):
  //   - reference_id: max 40 chars (a UUID is 36 chars, just fits)
  //   - note:         max 500 chars → defend against an overly long dog_name
  const note = `Deposit for ${dog_name} on ${date} ${start_time}`.slice(0, 500)
  let squareResult
  try {
    squareResult = await createSquarePayment({
      sourceId: source_id,
      amountCents: config.DEPOSIT_AMOUNT_CENTS,
      idempotencyKey: idempotency_key,
      referenceId: bookingId,
      note,
    })
  } catch (err) {
    console.error('[with-deposit] Square charge failed:', err)
    res.status(402).json({
      error: 'Payment failed',
      detail: err instanceof Error ? err.message : String(err),
    })
    return
  }

  // Step 3: insert the bookings row (pass the id explicitly, aligned with the Square reference_id)
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert({
      id: bookingId,
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
      deposit_status: 'paid',
      deposit_paid_at: new Date().toISOString(),
    })
    .select()
    .single()

  // Step 3b: fallback — charge succeeded but insert failed → refund
  if (bookingErr || !booking) {
    console.error('[with-deposit] CRITICAL: charge succeeded but booking insert failed', {
      squarePaymentId: squareResult.squarePaymentId,
      userId: req.user!.id,
      error: bookingErr,
    })

    try {
      await refundSquarePayment(squareResult.squarePaymentId, randomUUID())
      res.status(409).json({
        error: 'That slot was just taken. Your payment has been refunded.',
      })
    } catch (refundErr) {
      console.error('[with-deposit] DOUBLE CRITICAL: refund also failed', {
        squarePaymentId: squareResult.squarePaymentId,
        refundErr,
      })
      // Asynchronously notify Larry for manual intervention
      notifyLarryCriticalError({
        subject: 'URGENT: Square charge succeeded, booking failed, refund failed',
        details: {
          squarePaymentId: squareResult.squarePaymentId,
          userId: req.user!.id,
          userEmail: req.user!.email,
          bookingError: String(bookingErr),
          refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
          amountCents: config.DEPOSIT_AMOUNT_CENTS,
        },
      }).catch(e => console.error('Failed to notify Larry:', e))

      res.status(500).json({
        error: 'Payment processed but booking failed. You have been contacted by our team for a manual refund.',
      })
    }
    return
  }

  // Step 4: insert the payments audit row
  const { error: paymentErr } = await supabaseAdmin.from('payments').insert({
    booking_id: booking.id,
    type: 'deposit',
    amount_cents: config.DEPOSIT_AMOUNT_CENTS,
    currency: 'USD',
    status: 'paid',
    square_payment_id: squareResult.squarePaymentId,
    square_receipt_url: squareResult.receiptUrl,
    paid_at: new Date().toISOString(),
  })
  if (paymentErr) {
    // Non-fatal: the booking is created; a failed audit row only logs (the money was received and the booking was created)
    console.error('[with-deposit] payment audit row insert failed:', paymentErr)
  }

  // Step 5: AWAIT Google Calendar creation (same pattern as the existing POST /)
  const clientEmail = req.user!.email
  try {
    const eventId = await createCalendarEvent(booking, clientEmail)
    if (eventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
      booking.google_event_id = eventId
    }
  } catch (err) {
    console.error('[with-deposit] Calendar event failed:', err)
  }

  // Step 6: Fire-and-forget notifications
  sendBookingConfirmation(booking, clientEmail).catch(err => console.error('Confirmation email failed:', err))
  notifyDorisNewBooking(booking, clientEmail).catch(err => console.error('Doris email failed:', err))
  notifyDorisDepositPaid(booking, config.DEPOSIT_AMOUNT_CENTS, squareResult.receiptUrl)
    .catch(err => console.error('Doris deposit email failed:', err))
  notifyDorisSms(booking).catch(err => console.error('Doris SMS failed:', err))
  scheduleReminders(booking, clientEmail).catch(err => console.error('Schedule reminders failed:', err))

  res.status(201).json({
    ...booking,
    deposit_receipt_url: squareResult.receiptUrl,
  })
})
```

**Key design points**:
1. **Pre-check slot (step 1)**: a SELECT query, zero writes. Avoids charging on an obvious conflict.
2. **Charge first, then insert**: the intuitive order, without the state-machine complexity of "create a pending booking first".
3. **Race window handling**: there is a 1-3 second gap between step 1 and step 3 (Square API latency). In this window someone else might book the same slot. When that happens step 3 fails and enters the step 3b refund branch. Estimated 0-2 times per year.
4. **A failed payment audit row is non-fatal**: the booking is created and the money received; the audit row is just a record. On failure, log it and backfill manually.
5. **No retry logic**: on failure, let the customer re-enter the card and resubmit the entire flow (a new idempotency key, a new source token).

### 3.4 `backend/src/services/email.ts` — add two functions

**`notifyDorisDepositPaid`**: a deposit-received notification sent to Doris
```ts
export async function notifyDorisDepositPaid(
  booking: Booking,
  amountCents: number,
  receiptUrl: string | null,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)
  const amountDollars = (amountCents / 100).toFixed(2)

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.DORIS_EMAIL,
      subject: `Deposit Received: $${amountDollars} — ${booking.dog_name}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#5BA4D9">Deposit Received</h2>
          <p>A $${amountDollars} deposit has been paid for this booking:</p>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          ${receiptUrl ? `<p><a href="${receiptUrl}">View Square receipt</a></p>` : ''}
          <p style="color:#7A7570;font-size:13px;margin-top:16px">This deposit is non-refundable per policy. Balance due at grooming.</p>
        </div>
      `,
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to notify Doris about deposit:', err)
  }
}
```

**`notifyLarryCriticalError`**: a system alert sent to Larry
```ts
export async function notifyLarryCriticalError(params: {
  subject: string
  details: Record<string, unknown>
}): Promise<void> {
  if (!resend) return
  if (!config.LARRY_ALERT_EMAIL) {
    console.error('LARRY_ALERT_EMAIL not configured, skipping critical error notification')
    return
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.LARRY_ALERT_EMAIL,
      subject: `[DogsInFashion ALERT] ${params.subject}`,
      html: `
        <div style="font-family:monospace">
          <h2 style="color:#B84A4A">${params.subject}</h2>
          <p>This is an automated critical error notification from the Dogs in Fashion backend.</p>
          <pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto">${JSON.stringify(params.details, null, 2)}</pre>
          <p>Please investigate and take manual action if necessary.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to send critical error notification:', err)
  }
}
```

**`sendCancellationNotification`**: Phase 6.5 already built this function. In Phase 7, **extend it** by adding a deposit reminder section to the email HTML:
```ts
// In the sendCancellationNotification function, add before the existing html
const depositNotice = (booking as any).deposit_status === 'paid' ? `
  <div style="background:#FFF4E5;border-left:4px solid #E8975E;padding:12px 16px;margin:16px 0">
    <strong>About your $20 deposit:</strong> Per our cancellation policy, the deposit is non-refundable.
    If you have questions, please contact Doris directly.
  </div>
` : ''
```
Then insert `${depositNotice}` at an appropriate place in the email html.

### 3.5 Idempotency design (simplified version)

Only two layers of protection:
1. **The client generates `idempotency_key`** (`crypto.randomUUID()` on each Confirm button click) — guards against React double-clicks and network retries
2. **Square server-side enforcement** — within 24 hours the same key returns the original payment result, never charging twice

**There is no third DB-layer guard**, because under the atomic flow the situation of "an already-paid booking being POSTed again" does not exist (each POST creates a new booking).

### 3.6 Why there is no webhook
`autocomplete: true` makes the Square Payments API synchronously return a `COMPLETED` status, so there is no async status of "only learning after the payment completes". The only extra thing a webhook could tell us is "Doris manually refunded in the Square dashboard", but in this phase the refund flow is purely manual, so there is no benefit. Add it later in a future v2 if automatic refund tracking is needed.

---

## 4. Frontend Changes

### 4.1 How the Square Web SDK is loaded
Square does not ship an npm package; it is distributed only via CDN:
- Sandbox: `https://sandbox.web.squarecdn.com/v1/square.js`
- Production: `https://web.squarecdn.com/v1/square.js`

**Load it dynamically inside the `SquarePaymentForm` component**, not in `index.html`. Reasons:
- The home page and login page do not need to load Square, reducing wasted bandwidth
- At runtime, choose sandbox or prod based on `VITE_SQUARE_ENVIRONMENT`
- Under React 18 Strict Mode `useEffect` runs twice, so the loading logic must be idempotent (`if ((window as any).Square) return` first)

**Do not use `react-square-web-payments-sdk`**: the community wrapper's maintenance has stalled; writing ~80 lines of TypeScript yourself is more reliable.

### 4.2 New file `frontend/src/components/SquarePaymentForm.tsx`

```tsx
import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react'

type Props = {
  amountCents: number
}

export type SquarePaymentFormRef = {
  tokenize: () => Promise<string | null>  // returns a token, or null (on error)
}

const SquarePaymentForm = forwardRef<SquarePaymentFormRef, Props>((_props, ref) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        // 1. Load Square SDK (once)
        if (!(window as any).Square) {
          const scriptUrl = import.meta.env.VITE_SQUARE_ENVIRONMENT === 'production'
            ? 'https://web.squarecdn.com/v1/square.js'
            : 'https://sandbox.web.squarecdn.com/v1/square.js'

          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = scriptUrl
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load Square SDK'))
            document.head.appendChild(script)
          })
        }

        if (!mounted) return

        // 2. Initialize payments
        const Square = (window as any).Square
        const payments = Square.payments(
          import.meta.env.VITE_SQUARE_APPLICATION_ID,
          import.meta.env.VITE_SQUARE_LOCATION_ID,
        )

        // 3. Initialize card (style matches site palette)
        const card = await payments.card({
          style: {
            input: {
              color: '#2A2420',
              fontSize: '16px',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            },
            '.input-container': {
              borderRadius: '12px',
              borderColor: '#BEE3F8',
            },
            '.input-container.is-focus': {
              borderColor: '#5BA4D9',
            },
            '.message-text': {
              color: '#B84A4A',
            },
          },
        })

        if (!mounted) return

        await card.attach('#square-card-container')
        cardRef.current = card
        setLoading(false)
      } catch (err: any) {
        console.error('Square SDK init failed:', err)
        setError(err.message || 'Failed to load payment form')
        setLoading(false)
      }
    }

    init()

    return () => {
      mounted = false
      // Square card cleanup
      if (cardRef.current?.destroy) {
        cardRef.current.destroy().catch(() => {})
      }
    }
  }, [])

  useImperativeHandle(ref, () => ({
    tokenize: async () => {
      if (!cardRef.current) return null
      try {
        const result = await cardRef.current.tokenize()
        if (result.status === 'OK') {
          setError(null)
          return result.token
        } else {
          const errMsg = result.errors?.[0]?.message || 'Card tokenization failed'
          setError(errMsg)
          return null
        }
      } catch (err: any) {
        setError(err.message || 'Tokenization error')
        return null
      }
    },
  }))

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-warm-gray">Loading payment form...</p>}
      <div
        id="square-card-container"
        className="rounded-xl border-2 border-sky bg-cream p-3"
      />
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
})

export default SquarePaymentForm
```

**Key things to note**:
- Square's card-number input is an iframe, so you **cannot** style it directly with Tailwind; you must pass the config via `payments.card({ style })`
- The parent container's border / padding is still controlled by Tailwind as usual
- `forwardRef` + `useImperativeHandle` let the parent component trigger tokenize
- The Strict Mode double mount is guarded by `if (!(window as any).Square)`

### 4.3 `frontend/src/pages/BookingPage.tsx` changes

**The number of steps is unchanged, still 4 steps**. The deposit form is embedded **in the existing Confirm step**:

```tsx
import SquarePaymentForm, { SquarePaymentFormRef } from '../components/SquarePaymentForm'

const DEPOSIT_REQUIRED = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'
const DEPOSIT_CENTS = Number(import.meta.env.VITE_DEPOSIT_AMOUNT_CENTS || 2000)
const DEPOSIT_DOLLARS = (DEPOSIT_CENTS / 100).toFixed(0)

export default function BookingPage() {
  // ... existing state ...
  const squareFormRef = useRef<SquarePaymentFormRef>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (DEPOSIT_REQUIRED) {
        // 1. Tokenize card
        const token = await squareFormRef.current?.tokenize()
        if (!token) {
          // Error already shown inside SquarePaymentForm
          setSubmitting(false)
          return
        }

        // 2. Atomic POST
        await apiFetch('/api/bookings/with-deposit', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
            source_id: token,
            idempotency_key: crypto.randomUUID(),
          }),
        })
      } else {
        // old flow
        await apiFetch('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
          }),
        })
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    }
    setSubmitting(false)
  }

  // ... rest unchanged ...

  // UI update for Step 3 (Confirm):
  {step === 3 && selectedService && (
    <div>
      <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
        Confirm Your Booking
      </h2>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Order summary (unchanged) */}
      <div className="space-y-3 rounded-2xl bg-sky/20 p-6">
        {/* ... existing rows ... */}
      </div>

      {/* New: deposit form */}
      {DEPOSIT_REQUIRED && (
        <div className="mt-6 rounded-2xl border-2 border-sky bg-white p-6">
          <h3 className="mb-2 font-display text-lg font-bold text-warm-dark">
            Pay ${DEPOSIT_DOLLARS} Deposit
          </h3>
          <p className="mb-3 text-sm text-warm-gray">
            A ${DEPOSIT_DOLLARS} deposit is required to secure your slot.
            Balance (${selectedService.price - Number(DEPOSIT_DOLLARS)}) due on grooming day.
          </p>
          <div className="mb-4 rounded-lg bg-butter/30 p-3 text-xs text-warm-dark">
            <strong>⚠️ Non-refundable:</strong> This deposit acts as our cancellation fee.
          </div>
          <SquarePaymentForm ref={squareFormRef} amountCents={DEPOSIT_CENTS} />
        </div>
      )}
    </div>
  )}

  // Confirm button copy update:
  <button
    type="button"
    onClick={handleSubmit}
    disabled={submitting}
    className="..."
  >
    <Calendar className="h-4 w-4" />
    {submitting
      ? (DEPOSIT_REQUIRED ? 'Processing payment...' : 'Booking...')
      : (DEPOSIT_REQUIRED ? `Pay $${DEPOSIT_DOLLARS} & Confirm Booking` : 'Confirm Booking')
    }
  </button>
```

**No retry button, no Skip button, no 5th step, no `createdBooking` intermediate state.** Each time Confirm fails → the user re-enters the card → clicks Confirm again → a new idempotency key is generated automatically.

### 4.4 `MyBookingsPage.tsx` and `AdminDashboard.tsx` updates

Extend the frontend `Booking` interface (each of the two files has its own definition):
```ts
interface Booking {
  // ... existing fields ...
  deposit_status?: 'none' | 'paid' | 'refunded'
  deposit_paid_at?: string | null
}
```

Add a badge in `BookingCard` (rendered only when `VITE_DEPOSIT_REQUIRED=true`):
```tsx
const DEPOSIT_REQUIRED = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'

// In the badge area
{DEPOSIT_REQUIRED && booking.deposit_status === 'paid' && (
  <span className="rounded-full bg-sage-light px-2 py-0.5 text-xs font-semibold text-sage">
    Deposit paid
  </span>
)}
{DEPOSIT_REQUIRED && booking.deposit_status === 'refunded' && (
  <span className="rounded-full bg-warm-gray/20 px-2 py-0.5 text-xs font-semibold text-warm-gray">
    Deposit refunded
  </span>
)}
```

**The `none` status renders no badge at all** — this avoids related text appearing when flag=off, and also avoids an occasional anomalous booking looking strange when flag=on.

**AdminDashboard Cancel button**: Phase 6.5 already added the `hasDeposit` check logic to the confirm dialog, and it now takes effect automatically — no extra changes to the Cancel button code are needed.

---

## 5. File Change List

### New files
- `2026-04-XX-payments.sql` — DDL (§2, replace XX with the actual implementation date)
- `backend/src/services/square.ts` — Square SDK wrapper
- `frontend/src/components/SquarePaymentForm.tsx` — embedded card-number form

### Modified files
- `backend/src/config.ts` — 7 new env vars
- `backend/src/routes/bookings.ts` — add a guard to `POST /` + new `POST /with-deposit`
- `backend/src/services/email.ts` — add `notifyDorisDepositPaid` + `notifyLarryCriticalError` + add a deposit reminder in `sendCancellationNotification`
- `backend/package.json` — new dependency `square`
- `frontend/src/pages/BookingPage.tsx` — embed the deposit form in the Confirm step + `handleSubmit` branch
- `frontend/src/pages/MyBookingsPage.tsx` — `Booking` interface + badge
- `frontend/src/pages/AdminDashboard.tsx` — `Booking` interface + badge
- `.env.example` — clean up Stripe placeholders, replace with Square
- `DEPLOYMENT-GUIDE.md` — add a Square setup section

### Files not to touch
- `backend/src/services/google-calendar.ts` (already changed in Phase 6.5)
- `backend/src/jobs/reminder-scheduler.ts`

---

## 6. Out of Scope (explicitly not doing)

- **Automatic refunds**: a non-refundable deposit is simply the policy. If Doris wants to refund a special case, she does it manually herself in the Square dashboard
- **Online balance collection**: cash, or Doris marks it manually. The admin panel v1 does not add a "mark balance as paid" button
- **Tax calculation**: no use of the Square Order API; the deposit is just a flat fee
- **Apple Pay / Google Pay**: supported by the Square SDK but requires domain verification; v1 does cards only
- **Saving card info**: re-enter every time; no Customer/Card is created
- **Webhook**: `autocomplete:true` returns synchronously, so it is not needed
- **Subscriptions / recurring charges**: not applicable to the grooming business
- **Tipping**: not doing it
- **3DS strong verification**: Square supports it built-in, no extra handling
- **Multi-currency**: USD only

---

## 7. Deployment / Rollout Plan

### 7.1 Square Dashboard setup (Larry does it)
1. Go to squareup.com/developers and create a developer account (free)
2. Create an Application called "Dogs in Fashion"
3. Obtain the **Sandbox** credentials (Application ID, Access Token, Location ID) → for dev use
4. Doris sends the **Production** credentials to Larry (or Larry retrieves them on her behalf as an admin)
5. **No need to configure a webhook URL**

### 7.2 Environment variable matrix

| Variable | Dev (local) | Prod (Railway / Vercel) |
|---|---|---|
| `DEPOSIT_REQUIRED` | `true` (for dev testing) | **`false`** (off during the promotion period) |
| `DEPOSIT_AMOUNT_CENTS` | `2000` | `2000` |
| `SQUARE_ACCESS_TOKEN` | Larry sandbox | Doris production |
| `SQUARE_APPLICATION_ID` | Larry sandbox | Doris production |
| `SQUARE_LOCATION_ID` | Larry sandbox | Doris production |
| `SQUARE_ENVIRONMENT` | `sandbox` | `production` |
| `LARRY_ALERT_EMAIL` | Larry's personal email | Larry's personal email |
| `VITE_DEPOSIT_REQUIRED` | `true` | **`false`** |
| `VITE_DEPOSIT_AMOUNT_CENTS` | `2000` | `2000` |
| `VITE_SQUARE_APPLICATION_ID` | Larry sandbox | Doris production |
| `VITE_SQUARE_LOCATION_ID` | Larry sandbox | Doris production |
| `VITE_SQUARE_ENVIRONMENT` | `sandbox` | `production` |

**⚠️ Environment-mixing fail-safe**: a sandbox token + production application ID reports "token environment mismatch". These 12 variables must be configured uniformly as one group; do not split them apart.

### 7.3 Database migration
1. Supabase **dev** project → SQL Editor → paste `2026-04-XX-payments.sql` → run → verify the table and columns
2. Run the full flow test locally
3. Once satisfied, run the same migration in the Supabase **prod** project
4. Because production has `DEPOSIT_REQUIRED=false`, the `payments` table is created but is never written to (until the day the flag is flipped), so the risk is zero

### 7.4 Phased rollout (following the feedback workflow rules)

Follow this order strictly, and after completing each step **stop and wait for Larry to confirm before going to the next step**:

1. **DB migration dev** → verify both the `payments` table and the `bookings.deposit_status` column exist
2. **Backend changes** (config + square.ts + bookings.ts add guard + new endpoint + email.ts) → do not configure the Square env vars yet, start the service → `POST /api/bookings/with-deposit` returns 503
3. **Configure the dev Square sandbox env vars + `DEPOSIT_REQUIRED=true`** → test with Postman using a sandbox card
4. **Frontend changes** (SquarePaymentForm + BookingPage + badge) → run a full pass in the dev environment: book → sandbox test card → success
5. **Run the full test checklist** (§8)
6. **⛔ Stop and let Larry confirm all cases pass**
7. **Prod migration** → run the SQL in Supabase prod
8. **Prod env vars**: configure all the Square credentials on Railway / Vercel, **but `DEPOSIT_REQUIRED=false`**
9. **Deploy** backend + frontend
10. **Prod smoke test**: book one order → confirm **no** deposit UI appears → go through the original flow → no deposit badge in MyBookings / Admin
11. **Feature dormancy complete**

### 7.5 Enabling the deposit two months later (Operational Runbook)
1. Doris confirms she is ready → tells Larry
2. Larry sets `DEPOSIT_REQUIRED=true` on Railway → redeploy
3. Larry sets `VITE_DEPOSIT_REQUIRED=true` on Vercel → redeploy
4. Larry books one order himself with a real card as a $1 test (temporarily `DEPOSIT_AMOUNT_CENTS=100`) → confirm the Square dashboard received it → Doris receives the deposit-received email → refund from the Square dashboard → restore `DEPOSIT_AMOUNT_CENTS=2000`
5. Done

**Rollback**: change both flags back to `false` + redeploy. Minute-scale.

---

## 8. Verification / Test Checklist

The following tests are **all executed in the dev environment with `DEPOSIT_REQUIRED=true` + Square sandbox**:

### Square sandbox test cards
- `4111 1111 1111 1111` / CVV `111` / any future date / ZIP `94103` → success
- `4000 0000 0000 0002` → card declined
- `4000 0000 0000 0127` → CVV failure
- `4000 0000 0000 0069` → expired card

### Functional tests
- [ ] **Happy path**: book → in the Confirm step see the Square card form → enter a successful card → click "Pay $20 & Confirm" → success page → the `bookings` table has `deposit_status='paid'` and `deposit_paid_at` → the `payments` table has a corresponding row → see the transaction in the Square sandbox dashboard → Doris receives the deposit-received email → Doris receives the new-booking email → the customer receives the booking confirmation email
- [ ] **Receipt URL**: the success response contains `deposit_receipt_url`, which the frontend can display (optional)
- [ ] **Decline path**: enter a decline card → the frontend SquarePaymentForm shows an error → the booking is **never created** → no new row in the `bookings` table → no new row in the `payments` table → no transaction in the Square dashboard (or a FAILED-status attempt)
- [ ] **Retry after decline**: after a decline, re-enter a successful card → click Confirm again → new idempotency key → success (does not conflict with the previous failure)
- [ ] **CVV failure**: a wrong-CVV card → the frontend shows an error → the booking is not created
- [ ] **Double-click debounce**: rapidly click Pay twice → Square receives only 1 charge (is the same idempotency key reused? — actually this is a double-click at the instant of tokenize; the two tokenizes generate different tokens, and the second Submit button is already disabled)

### Permission / guard tests
- [ ] **`/api/bookings` disabled**: when `DEPOSIT_REQUIRED=true`, curl `POST /api/bookings` returns **503**
- [ ] **`/api/bookings/with-deposit` disabled**: when `DEPOSIT_REQUIRED=false`, curl `POST /api/bookings/with-deposit` returns **503**
- [ ] **Square not configured**: `DEPOSIT_REQUIRED=true` but missing `SQUARE_ACCESS_TOKEN` → `POST /with-deposit` returns **503**
- [ ] **Not logged in**: no Bearer token → returns 401
- [ ] **Invalid source_id**: pass a fake token → returns 402 `Payment failed`
- [ ] **Invalid idempotency_key (not a UUID)**: returns 400

### Edge tests
- [ ] **Slot taken (pre-check fails)**: two tabs select the same slot at the same time; the second tab returns 409 at pre-check, **without charging**
- [ ] **Slot taken (race in window)**: hard to reproduce reliably; can be simulated manually: after the Square charge but before the insert, manually INSERT a booking occupying that slot (while the sleep is in progress) → trigger the refund branch → verify this charge is refunded in the Square dashboard → the response is a 409 with a refund notice
- [ ] **Inject a refund failure**: temporarily mock `refundSquarePayment` to throw → trigger the critical email → Larry receives the alert email

### Smoke test (prod with `DEPOSIT_REQUIRED=false`)
- [ ] Open the booking page → complete the 4 steps → **no deposit UI** → the Confirm button shows "Confirm Booking" → success page normal
- [ ] In MyBookingsPage the booking **shows no deposit-related UI at all**
- [ ] In AdminDashboard the booking shows no deposit-related UI
- [ ] Directly curl `POST /api/bookings/with-deposit` → returns 503
- [ ] The booking flow's email/SMS/calendar all work normally, just as before flag=false
- [ ] **Cancel flow** (already verified in Phase 6.5) still works normally: admin cancel → customer receives email → calendar entry deleted in sync

### Regression tests
- [ ] **Phase 6.5's cancel flow** still works under flag=true: admin cancels a deposit-paid booking → the customer receives the cancellation email (including the non-refundable deposit reminder) → the deposit is **not automatically refunded** (Doris must handle it manually in the Square dashboard)
- [ ] **Reschedule** still works normally: a deposit-paid booking can be rescheduled, and the deposit is unaffected

---

## 9. Known Risks and Pitfalls

1. **`z.coerce.boolean()` trap** — `Boolean("false") === true`. Must use `z.enum(['true','false']).transform(v => v === 'true')`. The frontend is the same; Vite env is always a string, so you must compare explicitly with `=== 'true'`
2. **BigInt trap** — the Square SDK's `amountMoney.amount` must be a BigInt; passing a Number throws at runtime. Clearly commented in `square.ts`
3. **React 18 Strict Mode double execution** — Web SDK loading must check `window.Square` first, otherwise it reports "already initialized"
4. **Environment mixing** — sandbox `VITE_*` + production `SQUARE_ACCESS_TOKEN` reports "token environment mismatch". Configure the 12 variables uniformly as one group
5. **Square npm package version** — currently pinned to `^44.0.0` (latest at implementation time was `44.0.1`). Upgrading to v45+ does not guarantee compatibility; you must re-check the API shape against the `.d.ts` and run `npx tsc --noEmit`
6. **Square field length trap** — the `.d.ts` does not state field max length, but the Square REST API enforces checks: `reference_id` ≤ 40 / `note` ≤ 500 / `statement_description_identifier` ≤ 20 / `idempotency_key` ≤ 45. TypeScript cannot catch this; only a runtime 400 will. The correct approach: use the booking id directly for `reference_id` (a UUID is 36 chars, just fits, and also establishes the 1:1 reconciliation relationship between Square ↔ DB); any user input (dog_name, etc.) spliced into `note` must be `.slice(0, 500)`. The wrong way: using `${userId}-${Date.now()}` = 50 chars blows up (a gotcha hit during implementation)
7. **Race window** — estimated 0-2 times per year. Handled by the refund fallback; in extreme cases the refund also fails → alert Larry for manual handling
8. **`profiles` table assumption (already avoided)** — the v1 plan once had an "admin views payments" RLS policy that depended on the `profiles` table. The new plan avoids this dependency (the admin view goes through the backend API, using the service role key)
9. **Deposit policy**: non-refundable is an explicit policy. The customer must clearly see this information before paying, to avoid disputes

### PCI compliance
Using the Web Payments SDK's iframe fields + passing only the token, the card number never enters our server or the frontend React state, keeping the lowest-level **SAQ-A compliance**. **Absolutely never** store the card number in React state or manually read the iframe contents.

---

## 10. Critical Files (must read during implementation)

### Read-only reference
- `backend/src/routes/bookings.ts` — the pattern of the existing `POST /` (Zod, supabaseAdmin, fire-and-forget email, error-handling shape)
- `backend/src/config.ts` — already has the optional + graceful degradation Zod pattern; copy the Square vars strictly from it
- `backend/src/services/email.ts` — the module-level singleton + null-check pattern (`const resend = config.RESEND_API_KEY ? new Resend(...) : null`)
- `frontend/src/lib/api.ts` — the existing `apiFetch` wrapper; new frontend requests use it directly

### Need to modify
See the §5 file change list
