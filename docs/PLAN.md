# Dogs in Fashion — Full-Stack Booking Platform Implementation Plan

> Every Step must pass its tests before moving on to the next.
> Legend: ⬜ not started | 🔄 in progress | ✅ done

---

## Progress Summary (updated 2026-04-09)

| Phase | Description | Status | Notes |
|-------|------|------|------|
| Phase 1 | Project restructure + auth | ✅ done | 8/8 steps all done |
| Phase 2 | Core booking flow | ✅ done | 5/5 steps all done |
| Phase 3 | Google Calendar integration | ✅ done | Service Account configured, calendar sync + auto-backfill implemented |
| Phase 4 | Admin backend | ✅ done | 2/2 steps all done |
| Phase 5 | Email & SMS reminders | ✅ done | Email tested and passing (with .ics attachment), SMS skipped for now (needs 10DLC registration) |
| Phase 6 | Stripe payments | ⏸️ skipped for now | Implement later when needed |
| Phase 7 | Calendar two-way sync webhook | ⬜ not started | Can only be configured after deploying to a public network |
| Phase 8 | Recurring appointments | ⬜ not started | |
| Phase 9 | Deployment & launch | ⬜ not started | Dockerfile and vercel.json already exist |

**Overall progress: ~65%** (Phases 1-5 done and passing tests, Phase 6 skipped for now, Phases 7-9 not started)

**Environment configuration status:**
- Email (Gmail SMTP): ✅ tested and passing
- Google Calendar: ✅ tested and passing (with auto-resync mechanism)
- SMS (Twilio): ⏸️ skipped for now (needs A2P 10DLC registration)
- Production switch-over guide: ✅ see DEPLOYMENT-GUIDE.md

**Next step: Phase 7 — calendar two-way sync, or Phase 9 — deployment & launch**

---

## Overview

Transform the current frontend-only React landing page into a fully featured booking management platform, following the Full Slate model.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + react-router-dom |
| Backend | Express + TypeScript |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (Google OAuth + Email OTP) |
| Calendar | Google Calendar API (Service Account) |
| Notifications | Nodemailer (email) + Twilio (SMS) |
| Payments | Stripe |
| Deployment | Vercel (frontend) + Railway (backend) + Supabase (DB) |

### Project Structure

```
dogsinfashion/
├── package.json              # npm workspaces root
├── PLAN.md                   # this file
├── .env.example
├── frontend/                 # React + Vite
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── vercel.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/              # supabase.ts, api.ts
│       ├── context/          # AuthContext.tsx
│       ├── pages/            # HomePage, LoginPage, BookingPage, etc.
│       ├── components/       # existing + new
│       ├── data/             # services.ts
│       └── utils/            # calendar.ts, messaging.ts
└── backend/                  # Express API
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── src/
        ├── index.ts
        ├── app.ts
        ├── config.ts
        ├── middleware/       # auth.ts, admin.ts
        ├── routes/           # bookings.ts, availability.ts, reminders.ts, payments.ts
        ├── services/         # supabase.ts, google-calendar.ts, email.ts, sms.ts, stripe.ts, slots.ts
        ├── jobs/             # reminder-scheduler.ts
        └── types.ts
```

---

## Database Schema

> Run in the Supabase SQL Editor. Create tables incrementally as the Phases progress.

### Phase 1 Tables

```sql
-- profiles (extends Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users view own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Admin view all profiles" on profiles for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- trigger to auto-create a profile
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email in ('contact@dogsinfashion.com', 'dogsinfashionca@gmail.com') then 'admin' else 'client' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### Phase 2 Tables

```sql
-- availability (Doris's working hours)
create table availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true
);

insert into availability (day_of_week, start_time, end_time) values
  (1, '09:00', '17:00'), (2, '09:00', '17:00'), (3, '09:00', '17:00'),
  (4, '09:00', '17:00'), (5, '09:00', '17:00'), (6, '09:00', '17:00');

-- blocked_dates (blocked dates)
create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text
);

-- bookings
create table bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  service_id text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  dog_name text not null,
  dog_breed text,
  address text not null,
  notes text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'cancelled')),
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_user on bookings(user_id);
create index idx_bookings_date on bookings(date);

alter table bookings enable row level security;
create policy "Users view own bookings" on bookings for select using (auth.uid() = user_id);
create policy "Users create bookings" on bookings for insert with check (auth.uid() = user_id);
create policy "Admin view all" on bookings for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin update all" on bookings for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### Phase 5 Tables

```sql
-- reminders (reminder records)
create table reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null check (type in ('email', 'sms')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  metadata text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_reminders_scheduled on reminders(scheduled_at) where status = 'pending';
```

### Phase 6 Tables

```sql
-- payments (payment records)
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  stripe_payment_intent_id text not null unique,
  amount_cents int not null,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

-- add payment fields to bookings
alter table bookings add column payment_required boolean not null default false;
alter table bookings add column payment_status text default 'none'
  check (payment_status in ('none', 'pending', 'paid', 'refunded'));
```

### Phase 8 Tables

```sql
-- recurring_rules (recurring appointment rules)
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  service_id text not null,
  dog_name text not null,
  dog_breed text,
  address text not null,
  notes text,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- add association to bookings
alter table bookings add column recurring_rule_id uuid references recurring_rules(id);
```

---

## Phase 1: Project Restructure + Auth (Google + Email Signup)

### Step 1.1 ✅ Restructure project layout

**Actions:**
1. Create the `frontend/` directory
2. Move existing files into `frontend/`: `src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `vite-env.d.ts`
3. Move the existing `package.json` to `frontend/package.json`
4. Create the root `package.json` (npm workspaces)
5. Create the `backend/` directory structure
6. Update `.gitignore`

**Tests:**
- [ ] `cd frontend && npm install && npm run dev` → site displays normally, behavior unchanged
- [ ] All existing page components render correctly (Navbar, Hero, About, Services, Areas, HowItWorks, BookingForm, Footer)

---

### Step 1.2 ✅ Set up the Backend Express project

**Actions:**
1. `backend/package.json` + install dependencies
2. `backend/tsconfig.json`
3. `backend/src/index.ts` — Express startup
4. `backend/src/app.ts` — cors, helmet, json, route registration
5. `backend/src/config.ts` — read + validate environment variables
6. Create the `GET /api/health` health-check route

**Dependencies:**
```
express @supabase/supabase-js cors helmet zod dotenv
typescript tsx @types/express @types/cors (dev)
```

**Tests:**
- [ ] `cd backend && npm run dev` → service starts on port 3001
- [ ] `curl http://localhost:3001/api/health` → returns `{ "status": "ok" }`

---

### Step 1.3 ✅ npm workspaces + joint startup

**Actions:**
1. Configure workspaces in the root `package.json`: ["frontend", "backend"]
2. Install `concurrently`
3. Configure `npm run dev` to start frontend and backend together
4. Add proxy in `frontend/vite.config.ts`: `/api` → `http://localhost:3001`

**Tests:**
- [ ] Running `npm run dev` from the project root → frontend 5173 + backend 3001 start together
- [ ] Browse to `http://localhost:5173/api/health` → proxied to the backend, returns ok

---

### Step 1.4 ✅ Supabase project configuration

> This step requires manual operations in the Supabase Dashboard

**Actions:**
1. Create the Supabase project
2. Run the Phase 1 table-creation SQL in the SQL Editor (profiles + trigger)
3. Authentication → Providers → enable Email (default OTP / Magic Link)
4. Authentication → Providers → enable Google, fill in Client ID + Secret
5. Add the Supabase callback URL in the Google Cloud Console
6. Record `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
7. Create `frontend/.env.local` and `backend/.env`

**Tests:**
- [ ] Supabase Dashboard → Table Editor → the `profiles` table exists
- [ ] Authentication → Providers → both Email and Google show as Enabled

---

### Step 1.5 ✅ Frontend auth — Supabase Client + AuthContext

**Actions:**
1. In `frontend/`, install `@supabase/supabase-js`, `react-router-dom`
2. Create `frontend/src/lib/supabase.ts`
3. Create `frontend/src/context/AuthContext.tsx`
   - Listen to `onAuthStateChange`
   - Provide `user`, `session`, `profile`, `isLoading`, `signOut`
   - After login, fetch role from the `profiles` table
4. Create `frontend/src/components/ProtectedRoute.tsx`

**Tests:**
- [ ] AuthContext initializes correctly within App, no errors
- [ ] When not logged in, `user` is null

---

### Step 1.6 ✅ Frontend auth — LoginPage (Google + email signup)

**Actions:**
1. Create `frontend/src/pages/LoginPage.tsx`
   - **Google login button**: calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
   - **Email signup/login form**:
     - Enter email → calls `supabase.auth.signInWithOtp({ email })` → Supabase sends a verification code to the email
     - Enter the verification code → calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`
     - Two-step UI: first enter email → then show the verification-code input field
   - After successful login, redirect to `/book` (or the originating page)
2. Brand design matches the existing Tailwind style

**Supabase Email OTP notes:**
- Supabase Auth has built-in support for email OTP, so you don't need to send emails yourself
- `signInWithOtp` sends an email containing a 6-digit verification code to the user
- New users are auto-registered, existing users log in directly
- The email template can be customized in Supabase Dashboard → Authentication → Email Templates

**Tests:**
- [ ] Visit `/login` → the page renders correctly, with a Google login button and an email input field
- [ ] Click Google login → redirect to Google OAuth → after returning, login succeeds
- [ ] Enter email → receive the verification-code email → enter the code → login succeeds
- [ ] After login, there are matching records in the Supabase `auth.users` and `profiles` tables
- [ ] New users' `profiles.role` defaults to `client`; Doris's email is `admin`

---

### Step 1.7 ✅ Frontend routing overhaul

**Actions:**
1. Overhaul `frontend/src/App.tsx`: BrowserRouter + Routes + AuthProvider
2. Create `frontend/src/pages/HomePage.tsx`: assemble the existing components
3. Routes:
   - `/` → HomePage
   - `/login` → LoginPage
   - `/book` → ProtectedRoute → BookingPage (empty shell for now)
   - `/my-bookings` → ProtectedRoute → MyBookingsPage (empty shell for now)
   - `/admin` → ProtectedRoute(requireAdmin) → AdminDashboard (empty shell for now)
4. Modify `Navbar.tsx`:
   - Not logged in: show a "Sign In" button → redirect to /login
   - Logged in: show user avatar / name + dropdown menu (My Bookings, Sign Out)
   - Admin: additionally show an "Admin" link
   - "Book Now" button: logged in → /book, not logged in → /login
5. Modify `BookingForm.tsx`: simplify the homepage version, show a "Sign in to Book" CTA

**Tests:**
- [ ] `/` → homepage displays all components correctly
- [ ] Visiting `/book` while not logged in → auto-redirect to `/login`
- [ ] After login, Navbar shows the username and avatar
- [ ] Admin users can see the Admin link
- [ ] All navigation links work correctly

---

### Step 1.8 ✅ Backend auth middleware

**Actions:**
1. `backend/src/services/supabase.ts` — Supabase admin client (using service_role_key)
2. `backend/src/middleware/auth.ts`:
   - Extract the token from `Authorization: Bearer <token>`
   - Verify with `supabase.auth.getUser(token)`
   - Query the `profiles` table to get role
   - Attach `req.user = { id, email, role }`
3. `backend/src/middleware/admin.ts`: check `req.user.role === 'admin'`
4. Create the `GET /api/auth/me` route: return the current user's info

**Tests:**
- [ ] Accessing `/api/auth/me` with no token → 401
- [ ] Invalid token → 401
- [ ] After frontend login, accessing `/api/auth/me` with the session token → returns user info + role
- [ ] `frontend/src/lib/api.ts` fetch wrapper automatically attaches the Authorization header

---

## Phase 2: Core Booking Flow

### Step 2.1 ✅ Create booking-related tables

**Actions:**
1. Run the Phase 2 table-creation SQL in the Supabase SQL Editor
2. Seed the default schedule data

**Tests:**
- [ ] The `availability`, `blocked_dates`, `bookings` tables exist
- [ ] `availability` has 6 rows of default schedule (Monday through Saturday)

---

### Step 2.2 ✅ Backend — slot calculation + available-slots API

**Actions:**
1. `backend/src/services/slots.ts`:
   - Input: date, serviceId
   - Query the availability table to get that day's working hours
   - Query blocked_dates to check whether it's a blocked date
   - Query bookings to get existing bookings
   - Generate available start times at 30-minute intervals
   - Exclude conflicting slots
   - Return the list of available slots
2. `backend/src/routes/availability.ts`:
   - `GET /api/availability/slots?date=2026-04-15&serviceId=groom-small` → return slots

**Tests:**
- [ ] Empty schedule: return the full slot list
- [ ] Blocked date: return an empty list
- [ ] Existing booking conflict: the conflicting slot does not appear
- [ ] Service duration correctly affects selectable slots (2.5h vs 3.5h)
- [ ] Non-working day (Sunday): return empty

---

### Step 2.3 ✅ Backend — create-booking API

**Actions:**
1. `backend/src/routes/bookings.ts`:
   - `POST /api/bookings`:
     - Validate the request body (zod)
     - Compute end_time (start_time + service duration)
     - Re-validate slot availability (prevent concurrent conflicts)
     - Insert into the bookings table (status: 'confirmed')
     - Return the booking
   - `GET /api/bookings`:
     - Regular users: return their own bookings
     - Admin: return all bookings (supports ?status=&from=&to= filters)
   - `PATCH /api/bookings/:id/status`:
     - Admin only
     - Update status (completed / cancelled)

**Tests:**
- [ ] POST to create a booking → there is a record in the database, returns the full booking object
- [ ] POST for a duplicate slot → 400 "slot unavailable"
- [ ] GET as a regular user → only sees their own
- [ ] GET as Admin → sees all
- [ ] PATCH as non-admin → 403
- [ ] PATCH as admin → status updated successfully

---

### Step 2.4 ✅ Frontend — booking wizard BookingPage

**Actions:**
1. `frontend/src/pages/BookingPage.tsx` (4-step wizard):
   - **Step 1: Select service** — reuse the existing ServiceCard style
   - **Step 2: Select date and time** — use the SlotPicker component
   - **Step 3: Fill in details** — dog name, breed, address, notes
   - **Step 4: Confirm and submit** — summarize → POST /api/bookings
   - Success page: show booking details + a "View My Bookings" button
2. `frontend/src/components/SlotPicker.tsx`:
   - Calendar view (next 30 days)
   - After selecting a date, call `GET /api/availability/slots` to get available slots
   - Available slots are shown as buttons; unavailable ones are greyed out

**Tests:**
- [ ] Walk through the full 4-step wizard → booking succeeds
- [ ] SlotPicker correctly shows available/unavailable slots
- [ ] After submission, there is a record in the database
- [ ] When required fields are empty, there is form validation

---

### Step 2.5 ✅ Frontend — MyBookingsPage

**Actions:**
1. `frontend/src/pages/MyBookingsPage.tsx`:
   - Call `GET /api/bookings` to get the user's own bookings
   - Display each booking using the BookingCard component
   - Support cancellation (bookings in confirmed status)
   - Sort by date, distinguish "upcoming" and "past"
2. `frontend/src/components/BookingCard.tsx`

**Tests:**
- [ ] After creating a booking, it is visible on MyBookingsPage
- [ ] Cancel a booking → status changes to cancelled
- [ ] Past bookings appear in the "Past" section

---

## Phase 3: Calendar Integration (Google Calendar Sync)

### Step 3.1 ⬜ Google Calendar API configuration

> Manual operation

**Actions:**
1. Google Cloud Console → enable the Google Calendar API
2. Create a Service Account → download the JSON key
3. In Google Calendar, Doris goes to → Settings → Share → add the Service Account email → permission "Make changes to events"
4. Store the JSON key contents in `GOOGLE_SERVICE_ACCOUNT_KEY` in `backend/.env`
5. Set `DORIS_CALENDAR_ID=contact@dogsinfashion.com`

**Tests:**
- [ ] Service Account created successfully
- [ ] Doris's calendar sharing settings completed

---

### Step 3.2 ✅ Backend — Google Calendar event creation

**Actions:**
1. `backend/src/services/google-calendar.ts`:
   - `createEvent(booking, clientEmail)` → create an event, add Doris + the customer as attendees
   - `deleteEvent(eventId)` → delete the event when a booking is cancelled
   - `updateEvent(eventId, updates)` → update the event
   - Use `sendUpdates: 'all'` → Google automatically emails the attendees
2. Integrate into `POST /api/bookings`: after creating the booking, create the calendar event and store `google_event_id`
3. Integrate into `PATCH /api/bookings/:id/status`: delete the calendar event on cancellation

**Tests:**
- [ ] Create a booking → a new event appears in Doris's Google Calendar
- [ ] The event contains the correct time, location, and description
- [ ] Both Doris and the customer receive the calendar invite email
- [ ] Cancel a booking → the calendar event is deleted
- [ ] When the Service Account key is invalid → graceful degradation (the booking is still created, just without a calendar event)

---

### Step 3.3 ✅ Backend — real-time calendar sync (availability-aware)

**Actions:**
1. Extend `slots.ts`: query Google Calendar to get Doris's freebusy info
   - `calendar.freebusy.query()` → get busy slots for the given date range
   - Treat non-platform events on Google Calendar as unavailable slots too
2. Merge: database bookings + Google Calendar busy slots = final available slots

**Tests:**
- [ ] Doris manually adds a personal event in Google Calendar
- [ ] That slot is shown as unavailable on the booking page
- [ ] After deleting the personal event, the slot becomes available again

---

## Phase 4: Admin Backend

### Step 4.1 ✅ Frontend — AdminDashboard booking management

**Actions:**
1. `frontend/src/pages/AdminDashboard.tsx`:
   - **Booking Management Tab**:
     - Booking list (all customers)
     - Filter by status (confirmed / completed / cancelled)
     - Filter by date range
     - Action buttons: mark complete, cancel
   - Show customer info, dog info, service, time, address

**Tests:**
- [ ] Admin logs in → /admin → sees all bookings
- [ ] Filtering works correctly
- [ ] Mark complete → status changes to completed
- [ ] Cancel → status changes to cancelled + calendar event deleted

---

### Step 4.2 ✅ Frontend — AdminDashboard schedule management

**Actions:**
1. Add a **Schedule Management Tab** to AdminDashboard:
   - `AvailabilityEditor.tsx`: edit start/end time for each day, toggle active
   - Blocked-date management: calendar selection → add/remove
2. Backend routes:
   - `GET /api/availability/schedule` → return availability + blocked_dates
   - `PUT /api/availability/schedule` → batch-update availability
   - `POST /api/availability/blocked-dates` → add a blocked date
   - `DELETE /api/availability/blocked-dates/:id` → delete a blocked date

**Tests:**
- [ ] Modify working hours → booking-page slots change in sync
- [ ] Add a blocked date → no available slots on that date
- [ ] Delete a blocked date → slots are restored

---

## Phase 5: Email & SMS Reminders (Automatic Reminders)

### Step 5.1 ✅ Create the reminders table + backend email service

**Actions:**
1. Run the Phase 5 table-creation SQL in Supabase (reminders table)
2. `backend/src/services/email.ts`:
   - `sendBookingConfirmation(booking, client)` — booking-confirmation email to the customer
   - `notifyDorisNewBooking(booking, client)` — notify Doris of a new booking
   - `sendReminder(booking, client)` — booking-reminder email
   - Use Nodemailer + Gmail SMTP (App Password)
3. Integrate into `POST /api/bookings`: send the confirmation email + notify Doris when a booking is created

**Environment variables:**
```
SMTP_USER=contact@dogsinfashion.com
SMTP_PASS=<gmail-app-password>
DORIS_EMAIL=contact@dogsinfashion.com
```

**Tests:**
- [ ] Create a booking → the customer receives the confirmation email
- [ ] Create a booking → Doris receives the new-booking notification email
- [ ] The email content contains the complete booking information

---

### Step 5.2 ✅ SMS notifications (Twilio)

**Actions:**
1. `backend/src/services/sms.ts`:
   - Send SMS using the Twilio SDK
   - `sendSmsReminder(phone, message)` — send a reminder SMS
   - `notifyDorisSms(message)` — notify Doris by SMS
2. Integrate into booking creation: notify Doris by SMS (if the customer provided a phone number)

**Environment variables:**
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DORIS_PHONE=+19162871878
```

**Tests:**
- [ ] Create a booking → Doris's phone receives the SMS notification
- [ ] Customer with no phone number → SMS skipped, no error

---

### Step 5.3 ✅ Automatic reminder scheduler

**Actions:**
1. `backend/src/jobs/reminder-scheduler.ts`:
   - When a booking is created, insert two records into the reminders table:
     - Email reminder: 24 hours before the booking
     - SMS reminder: 2 hours before the booking (if the customer has a phone number)
   - Scheduled task (runs every 10 minutes):
     - Query the `reminders` table for `status='pending'` and `scheduled_at <= now()`
     - Send the email or SMS
     - Update `status` to `sent` or `failed`
2. Implement using `setInterval` (a simple approach, suitable for a single instance)
3. When a booking is cancelled, delete the corresponding pending reminders

**Tests:**
- [ ] Create a booking → there are two records in the reminders table, with correct scheduled_at
- [ ] Manually change scheduled_at to a past time → the scheduler triggers sending
- [ ] The email reminder sends successfully
- [ ] The SMS reminder sends successfully
- [ ] Cancel a booking → the corresponding pending reminders are deleted
- [ ] An already-sent reminder is not sent again

---

### Step 5.4 ✅ Admin reminder settings

**Actions:**
1. Add reminder settings to AdminDashboard:
   - Email reminder: toggle + lead time (default 24h)
   - SMS reminder: toggle + lead time (default 2h)
2. Store the backend configuration in the database (or, for simplicity, use environment variables)

**Tests:**
- [ ] Turn off email reminders → no more email reminders are generated
- [ ] Change the lead time → scheduled_at is calculated correctly

---

## Phase 6: Credit Card Payments (Stripe Payments)

### Step 6.1 ⬜ Stripe configuration + payments table

**Actions:**
1. Register a Stripe account, get the API keys (use test mode first)
2. Run the Phase 6 table-creation SQL in Supabase
3. Install the `stripe` package in the backend
4. `backend/src/services/stripe.ts`:
   - `createPaymentIntent(amount, metadata)` — create a payment intent
   - `handleWebhook(event)` — handle the Stripe webhook

**Environment variables:**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...  # for the frontend
```

**Tests:**
- [ ] Able to create a PaymentIntent → returns client_secret
- [ ] The Stripe Dashboard shows the test payment

---

### Step 6.2 ⬜ Backend — payment flow

**Actions:**
1. Modify the booking-creation flow:
   - Admin can enable "payment required" in the service settings
   - When a booking is created and payment is required → first create a PaymentIntent → return client_secret
   - The booking status is initially set to `confirmed` + `payment_status: 'pending'`
2. `POST /api/payments/webhook`:
   - Listen for `payment_intent.succeeded` → update `payment_status: 'paid'`
   - Listen for `payment_intent.payment_failed` → mark as failed
3. Admin can set the payment mode:
   - Full payment
   - Deposit (e.g. $25)
   - Collect card number only (no charge)

**Tests:**
- [ ] Booking that requires payment → returns client_secret
- [ ] Stripe test card 4242... → payment succeeds → payment_status changes to paid
- [ ] Failing test card → payment_status unchanged
- [ ] Webhook correctly updates the database

---

### Step 6.3 ⬜ Frontend — payment UI

**Actions:**
1. Install `@stripe/stripe-js`, `@stripe/react-stripe-js`
2. Integrate Stripe Elements in BookingPage Step 4:
   - If the service requires payment → show the credit-card input field
   - Confirm payment → `stripe.confirmPayment()`
   - Payment succeeds → show the success page
3. MyBookingsPage shows payment status

**Tests:**
- [ ] Service that requires payment → the booking wizard shows the payment step
- [ ] Test-card payment succeeds → booking completes
- [ ] Service that does not require payment → the payment step is not shown
- [ ] MyBookingsPage shows the correct payment status

---

## Phase 7: Real-Time Calendar Two-Way Sync (Enhancement)

### Step 7.1 ⬜ Google Calendar Webhook

**Actions:**
1. Extend `backend/src/services/google-calendar.ts`:
   - `watchCalendar()` — register a Google Calendar push notification
   - `POST /api/calendar/webhook` — receive Google Calendar change notifications
2. When Doris modifies/cancels an event in Google Calendar:
   - Receive the webhook
   - Find the corresponding booking (via google_event_id)
   - Sync-update the database

**Note:** This requires a public HTTPS endpoint. It can only be tested after deploying to Railway.

**Tests:**
- [ ] After deployment, register the webhook → Google returns success
- [ ] Doris cancels an event in Google Calendar → the database booking status changes to cancelled
- [ ] Doris changes an event's time → the database is updated in sync

---

## Phase 8: Recurring Appointments (Recurring Appointments)

### Step 8.1 ⬜ Recurring appointment rules

**Actions:**
1. Run the Phase 8 table-creation SQL in Supabase
2. `backend/src/routes/recurring.ts`:
   - `POST /api/recurring` — create a recurring rule
   - `GET /api/recurring` — view my recurring rules
   - `PATCH /api/recurring/:id` — modify a rule
   - `DELETE /api/recurring/:id` — deactivate a rule
3. `backend/src/jobs/recurring-generator.ts`:
   - Runs once a day
   - Find active recurring_rules
   - Automatically create bookings for the next N days (e.g. 14 days)
   - Skip existing bookings + blocked dates + slot conflicts

**Tests:**
- [ ] Create an "every Tuesday 10:00" rule → 2 bookings are auto-generated over the next 2 weeks
- [ ] The bookings' recurring_rule_id is associated correctly
- [ ] Blocked dates are skipped, not generated
- [ ] Slot conflicts are skipped, not generated

---

### Step 8.2 ⬜ Frontend — recurring appointment management

**Actions:**
1. Add an option to BookingPage: "Make this a recurring appointment"
   - Choose frequency: weekly / biweekly / monthly
2. MyBookingsPage shows a recurring-appointment marker
3. Recurring appointment management page:
   - View/edit/deactivate recurring rules
   - View all bookings generated from a rule
   - Single-occurrence exception: cancel one occurrence without affecting the rule

**Tests:**
- [ ] Create a recurring appointment → the rule is saved + bookings are auto-generated
- [ ] Change the frequency → subsequent bookings are generated at the new frequency
- [ ] Deactivate the rule → no new bookings are generated
- [ ] Cancel a single occurrence → the rule is unaffected, the next one is still generated

---

## Phase 9: Deployment & Launch

### Step 9.1 ⬜ Backend deployment (Railway)

**Actions:**
1. Create `backend/Dockerfile`
2. Connect Railway to the GitHub repo → set root directory = backend
3. Configure environment variables
4. Deploy → get the public URL

**Tests:**
- [ ] Railway URL + `/api/health` → returns ok
- [ ] Set the frontend's VITE_API_URL to the Railway URL → API calls work correctly

---

### Step 9.2 ⬜ Frontend deployment (Vercel)

**Actions:**
1. Create `frontend/vercel.json` (SPA rewrite)
2. Connect Vercel to GitHub → set root directory = frontend
3. Configure environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL)
4. Deploy

**Tests:**
- [ ] Vercel URL → site displays normally
- [ ] Log in → book → full flow works end to end

---

### Step 9.3 ⬜ DNS migration

**Actions:**
1. Remove the GitHub Pages CNAME
2. At the domain registrar, point www.dogsinfashion.com to Vercel
3. Add the custom domain in Vercel + automatic HTTPS

**Tests:**
- [ ] www.dogsinfashion.com → the new site
- [ ] HTTPS works
- [ ] All features work end to end

---

## Environment Variables Summary

### frontend/.env.local
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### backend/.env
```env
PORT=3001
NODE_ENV=development

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
DORIS_CALENDAR_ID=contact@dogsinfashion.com

# Email
DORIS_EMAIL=contact@dogsinfashion.com
SMTP_USER=contact@dogsinfashion.com
SMTP_PASS=<gmail-app-password>

# SMS (Twilio)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DORIS_PHONE=+19162871878

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS
FRONTEND_URL=http://localhost:5173
```
