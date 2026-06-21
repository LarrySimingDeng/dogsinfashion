# Dogs in Fashion — Production Environment Configuration Guide

> This document explains how to switch from the development environment (Larry's test account) to the production environment (Doris's official account).
> The development environment uses `<your-dev-email>`, the production environment uses `contact@dogsinfashion.com`.

---

## Architecture Overview: Who Manages What

| Role | What They Manage |
|------|----------|
| **Larry (developer)** | Google Cloud project, Service Account, Resend account, Twilio account, Supabase, code deployment |
| **Doris (business owner)** | Only needs to do one thing: share her Google Calendar with the Service Account |

> Technical platforms like Google Cloud Console, Resend, Twilio Console, and Supabase are all managed by Larry; Doris does not need to touch them.
> Email is sent through Resend using the owned domain `dogsinfashion.com`, no longer relying on Doris's Gmail account.

---

## Current Environment Comparison

| Config Item | Development (Larry) | Production (Doris) |
|--------|-------------------|-------------------|
| DORIS_EMAIL (receives notifications) | <your-dev-email> | contact@dogsinfashion.com |
| RESEND_API_KEY | key from the same Resend account | same one (no change needed) |
| DORIS_CALENDAR_ID | <your-dev-email> | contact@dogsinfashion.com |
| GOOGLE_SERVICE_ACCOUNT_KEY | Larry's GCP project, same Service Account | same one (no change needed) |
| DORIS_PHONE | <your-dev-phone> (dev) | +19162871878 (Doris) |
| TWILIO_* | not yet configured | needs 10DLC registration completed |

---

## 1. Email Configuration (Resend)

### Architecture Overview

All emails are sent through **Resend**, with a unified From address `Dogs in Fashion <noreply@dogsinfashion.com>`. There are two independent paths:

| Path | Who Sends It | Sending Method | From Address | Managed At |
|------|--------|----------|-----------|----------|
| **Backend transactional email** (booking confirmation/reschedule/reminder, Doris notifications) | backend code `backend/src/services/email.ts` | Resend HTTP API | `noreply@dogsinfashion.com` | `RESEND_API_KEY` in `backend/.env` |
| **Supabase Auth email** (registration confirmation / Magic Link / password reset) | Supabase Auth service | Resend SMTP | `noreply@dogsinfashion.com` | Supabase Dashboard → Authentication → Emails → SMTP Settings |

Both paths share the same Resend account, the same verified domain, and the same set of DNS records. **Doris does not need to generate a Gmail App Password at all, nor manage any email configuration.**

### Resend Account Information

- **Account holder**: Larry
- **Verified domain**: `dogsinfashion.com` (Region: us-east-1)
- **DNS records location**: Squarespace DNS (the domain registrar for `dogsinfashion.com`)
- **3 DNS records total**:
  - DKIM TXT: `resend._domainkey` → `p=MIGfMA0G...`
  - SPF MX: `send` → `feedback-smtp.us-east-1.amazonses.com` (Priority 10)
  - SPF TXT: `send` → `v=spf1 include:amazonses.com ~all`
- **Free quota**: 100 emails/day, 3000 emails/month (more than enough for Doris's business volume)

### Backend `.env` Configuration (booking email)

```env
# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx   # Generate from Resend Dashboard → API Keys
DORIS_EMAIL=contact@dogsinfashion.com  # Address that receives notification emails (in dev, use Larry's)
```

**The From address is hardcoded in the code** (the `FROM_ADDRESS` constant at the top of `backend/src/services/email.ts`), no need to set it in .env.

### Supabase Custom SMTP Configuration (auth email)

Supabase Dashboard → **Authentication** → **Emails** → **SMTP Settings**, check **Enable Custom SMTP**, fill in:

| Field | Value |
|------|-----|
| **Sender email** | `noreply@dogsinfashion.com` |
| **Sender name** | `Dogs in Fashion` |
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` (literally these 6 letters, **not an email**) |
| **Password** | the same key as the backend `RESEND_API_KEY` |

> ⚠️ Gotcha: The Username is just the 6 letters `resend`. Many people's first instinct is to fill in an email, which will cause a 535 authentication failure.

### Supabase Email Templates

Supabase Dashboard → **Authentication** → **Email Templates**, there are 3 templates to change (the other 2, Invite User / Change Email, are left at default):

| Supabase Template | Source File | Suggested Subject |
|--------------|--------|--------------|
| **Confirm signup** | `email-templates/confirm-signup.html` | `Confirm your email — Dogs in Fashion 🐾` |
| **Magic Link** | `email-templates/magic-link.html` | `Sign in to Dogs in Fashion 🐾` |
| **Reset Password** | `email-templates/reset-password.html` | `Reset your password — Dogs in Fashion 🐾` |

The `{{ .ConfirmationURL }}` in the HTML is a Supabase placeholder; it will be automatically replaced with the real link when the email is sent, **don't change it**.

### Building Resend from Scratch (disaster recovery / account migration reference)

If one day you need to migrate Resend from Larry's account to Doris's account, or start over from scratch:

1. Register a new account at https://resend.com
2. **Domains** → Add Domain `dogsinfashion.com`, select Region **us-east-1**
3. Resend displays 3 DNS records; go to the Squarespace DNS backend (`account.squarespace.com` → Domains → DNS Settings → Custom Records) and add them one by one:
   - Fill the Host field with Resend's Name (remove the `.dogsinfashion.com` suffix)
   - Paste the full value into the Data field, without quotes
4. Wait 5–30 minutes until all records turn green on the Resend side ✅
5. **API Keys** → Create API Key:
   - Name: `dogsinfashion-backend-prod`
   - Permission: **Sending access** (not Full access)
   - Domain: restrict to `dogsinfashion.com`
6. Copy the key (**shown only once**) → immediately paste it into `backend/.env` and the Railway environment variable `RESEND_API_KEY`
7. Update the SMTP Password in the Supabase Dashboard to the new key
8. Test one booking + one "forgot password"; if both are received, it's a success

### Special Notes for Local Development

`backend/.npmrc` explicitly specifies the public npm registry:

```
registry=https://registry.npmjs.org/
```

**Reason**: Larry's local `~/.npmrc` is configured with Apple's internal Artifactory (`https://npm.apple.com`); without this project-level `.npmrc`, `npm install` would pull certain packages (e.g. `svix`, a Resend dependency) from Apple's internal network, polluting `package-lock.json` and causing `ENOTFOUND artifacts.apple.com` failures during Railway deployment.

**If whoever takes over this project is not an Apple employee**: the `.npmrc` file can be ignored; it's also harmless for public-registry users.

### Verification Method

**Backend booking email**:
1. Create a test booking on the site, filling in your own email
2. The customer email receives `Booking Confirmed — ...`, From is `Dogs in Fashion <noreply@dogsinfashion.com>`, with a .ics attachment
3. The email configured in `DORIS_EMAIL` receives `New Booking: ...`
4. Resend Dashboard → **Logs** shows a Delivered record

**Supabase auth email**:
1. On the login page click "Forgot password" → enter email → submit
2. Receive `Reset your password — Dogs in Fashion 🐾`, styled with the blue-yellow gradient + 🐾 custom template
3. Clicking the button jumps to the site to start the reset

### Common Troubleshooting

| Symptom | Possible Cause | How to Fix |
|------|----------|-------|
| Email goes to spam | SPF/DKIM not verified, or DNS still propagating | Go to the Resend Dashboard and confirm all 3 records are green |
| Supabase reports `535 Authentication credentials invalid` | SMTP Username is wrong; it should be `resend`, not an email | Change it back to `resend` |
| Backend log `Failed to send confirmation email: ...` | `RESEND_API_KEY` not configured or invalidated by rotation | Check Railway environment variables / Resend Dashboard |
| Railway deployment `ENOTFOUND artifacts.apple.com` | The lockfile was polluted by Apple's internal registry when generated locally | Confirm `backend/.npmrc` exists, delete the lockfile and re-run `npm install` |

---

## 2. Google Calendar Configuration (booking sync to Doris's calendar)

### What Needs to Be Done

Enable the system to automatically create/delete/query booking events on Doris's Google Calendar.

### What Doris Needs to Do (you can walk her through it on a video call)

1. Log in to Google with `contact@dogsinfashion.com`
2. Open https://calendar.google.com
3. On the left **Settings for my calendars** → click your own calendar name
4. Scroll to **Share with specific people or groups**
5. Click **+ Add people and groups**
6. Enter the following email (you can send it to Doris in advance for her to copy and paste):
   ```
   dogsinfashion-calendar@dogsinfashion.iam.gserviceaccount.com
   ```
7. For permission select **Make changes to events** (not See all event details!)
8. Click **Send**

> This step only needs to be done once. After that, the system can permanently create/delete booking events on Doris's calendar.

### Modify backend/.env

```env
# Change to Doris's calendar ID (which is her Gmail address)
DORIS_CALENDAR_ID=contact@dogsinfashion.com
```

> Note: `GOOGLE_SERVICE_ACCOUNT_KEY` does not need to be changed; development and production use the same Service Account.

### Verification Method

After creating a test booking, Doris's Google Calendar should show the corresponding event, including:
- The correct date and time
- Customer information and address in the event description

> Note: Due to Service Account limitations, calendar events will not automatically add the customer as an attendee.
> The customer will add it to their own calendar via the .ics calendar file attached to the confirmation email.
>
> Reliability safeguard: The system automatically scans the database every 5 minutes; if any booking failed to sync to the calendar, it will automatically re-create it.

---

## 3. SMS Text Notification Configuration (texting Doris)

### Current Status

The SMS feature is not yet enabled. Twilio requires a US local number to complete **A2P 10DLC registration** before it can send texts.

### Twilio Account Information (already created)

- Account SID: (see backend/.env)
- Auth Token: (see backend/.env)
- Purchased number: (see backend/.env)

### Steps to Enable SMS

1. **Log in to Twilio Console** https://console.twilio.com
2. Complete **A2P 10DLC registration**:
   - Left menu → **Messaging** → **Compliance** → **A2P Brand Registration**
   - Fill in company information:
     - Company Name: Dogs in Fashion
     - Company Type: Sole Proprietor
     - Industry: Pet Services
   - After submitting, wait for approval (usually 1-5 business days)
3. After registration passes, create a **Campaign**:
   - Use Case: Appointment Reminders
   - Associate the purchased number `+16066590806`
4. Once the Campaign is approved, you can send texts

### Modify backend/.env

```env
# Uncomment and change the phone number to Doris's
TWILIO_ACCOUNT_SID=<see backend/.env>
TWILIO_AUTH_TOKEN=<see backend/.env>
TWILIO_PHONE_NUMBER=<see backend/.env>
DORIS_PHONE=+19162871878
```

### Verification Method

After creating a test booking, Doris's phone should receive an SMS notification.

---

## 4. Square Deposit Payment Configuration

### Design Overview

- **Mandatory deposit**: Once enabled, all new bookings must first pay a `$20` non-refundable deposit before they can be placed. This goes through the Square Web Payments SDK (the card number input is hosted in a Square iframe, and what our server receives is only a one-time `source_id`, never touching the card number; for compliance this qualifies as PCI SAQ-A)
- **Feature flag**: The backend `DEPOSIT_REQUIRED` + frontend `VITE_DEPOSIT_REQUIRED` must be **flipped at the same time**
  - `false / false` → old logic: no payment required, place the order directly
  - `true / true` → new logic: first tokenize → charge → insert booking
  - `true / false` (frontend not changed) → frontend hits the old endpoint, the backend's 503 guard "Deposit required. Use /api/bookings/with-deposit" blocks it hard
  - `false / true` (backend not changed) → frontend asks the user to enter card details and pay, the backend returns 404 "Square not configured or feature disabled"
  - This "double lock" is intentional: any config drift on either side is exposed immediately, so there's no situation where Doris thinks she received a deposit but actually didn't
- **Atomic payment flow**: pre-check slot → Square charge → insert booking (the row id uses a pre-generated UUID as the Square `reference_id`) → if the insert fails then refund → if the refund also fails, send a `LARRY_ALERT_EMAIL` alert
- **Deposit status persistence**: `bookings.deposit_status ∈ {'none','paid','refunded'}` + `bookings.deposit_paid_at` + a separate `payments` table for reconciliation

### Architecture Overview: Who Manages Square

| Role | What They Manage |
|------|---------|
| **Larry (development phase)** | Develops and integrates using his own Square sandbox account |
| **Doris (production phase)** | The only thing she needs to do: send Larry the **Location ID**, **Application ID** (Production), and **Access Token** (Production) from her Square account |

> Before go-live Doris already has a Square account (she already uses Square for in-person card swipe payments); Larry needs to obtain 3 credentials from her Square Developer Dashboard.

### Have Doris Create a Square Application (Production credentials)

The native "accept in-person payment" in a Square account does not produce API credentials—we need to create a new Application in the Developer Dashboard:

1. Doris logs in to https://developer.squareup.com/apps with her Square account (the same Seller Account)
2. Click **+ Create your first application** (or the **+** at the top right)
3. Fill in the Application name as `Dogs in Fashion Website`, select **I'm building for myself**, submit
4. Enter the App page, switch the environment at the top right to **Production** (it opens to Sandbox by default, an easy trap)
5. **Credentials** tab:
   - Record the **Production Application ID** (starts with `sq0idp-`)
   - Record the **Production Access Token** (starts with `EAAA`, this is the production token, **never put it in git, never post it in chat, only into Railway environment variables**)
6. **Locations** tab:
   - Find the existing production location that Doris has (usually her storefront address), record the **Production Location ID** (a 26-character string starting with `L`)

> ⚠️ Gotcha: The Application ID and Access Token come in two sets, Sandbox / Production, and the **Location ID also comes in two sets**. When switching tabs, be sure to confirm the environment at the top right is Production.

### Backend env (Railway production environment variables)

```env
# Square mandatory deposit (deploy with false first, then flip to true)
DEPOSIT_REQUIRED=false
DEPOSIT_AMOUNT_CENTS=2000
SQUARE_ACCESS_TOKEN=EAAA...              # Doris's account Production Access Token
SQUARE_APPLICATION_ID=sq0idp-...         # Doris's account Production Application ID
SQUARE_LOCATION_ID=L...                  # Doris's account Production Location ID
SQUARE_ENVIRONMENT=production            # Critical: choose one of sandbox / production
LARRY_ALERT_EMAIL=<your-dev-email>   # Emergency alert when payment succeeds but booking write fails + refund also fails
```

### Frontend env (Vercel/Railway frontend environment variables)

```env
VITE_DEPOSIT_REQUIRED=false
VITE_DEPOSIT_AMOUNT_CENTS=2000
VITE_SQUARE_APPLICATION_ID=sq0idp-...    # Same as the backend (Production Application ID)
VITE_SQUARE_LOCATION_ID=L...             # Same as the backend (Production Location ID)
VITE_SQUARE_ENVIRONMENT=production       # Determines whether to load web.squarecdn.com or sandbox.web.squarecdn.com
```

> The frontend only holds the Application ID + Location ID, **never put the Access Token there**. The Access Token belongs only to the backend; leaking it means someone can collect payments on Doris's behalf.

### Database Migration

Before the first go-live, run this once in the SQL Editor of the **Supabase production project**:

```
sql/2026-04-10-payments.sql
```

This SQL script is idempotent (`if not exists` + `do $ ... $`); running it repeatedly will not error. It will:
- Add two columns `deposit_status` and `deposit_paid_at` to the `bookings` table
- Create a new `payments` table + RLS policies (users can only see their own payment records, admin bypasses RLS via the service role)

### Go-Live Process (shadow deploy first, then flip the flag)

1. **Code goes live but flag off**: set both `DEPOSIT_REQUIRED` / `VITE_DEPOSIT_REQUIRED` to `false`, deploy once, confirm the old ordering flow is completely unchanged (regression test)
2. **Run the migration SQL on the Supabase production database**
3. **Small-scale verification**: make the site visible only to Doris (e.g. temporarily set `VITE_DEPOSIT_REQUIRED=true` but don't notify customers), place a real order yourself with a real payment + real refund, confirm the Square Dashboard shows the $20 charge, `bookings.deposit_status='paid'`, and all emails arrive
4. **Officially flip the flag**: change both frontend and backend to `true` at the same time, redeploy, notify Doris that the new rule is in effect

### Emergency Rollback

Immediately upon discovering a problem:
1. Change both frontend and backend environment variables back to `DEPOSIT_REQUIRED=false` / `VITE_DEPOSIT_REQUIRED=false` at the same time
2. Trigger a Railway/Vercel redeploy
3. Deposits already received can be refunded manually one by one in the Square Dashboard

**Note**: Bookings that already have `deposit_status='paid'` will not automatically revert to `'none'`—if you want to fully roll back these records, you need to refund in the Square Dashboard, then manually update the database row (or directly cancel the corresponding booking through the normal cancel flow, and the deposit will be refunded automatically—see below)

### Deposit Handling on Booking Cancellation

**Current policy: no refund**. When a customer or Doris cancels a booking, `deposit_status='paid'` stays unchanged, only `bookings.status` is changed to `'cancelled'`. The cancellation email includes a note telling the customer the deposit is non-refundable.

> In the future, if you want to distinguish policies like "cancel 24 hours in advance for no deposit / no refund after", that means changing the business logic in the `PATCH /api/bookings/:id/status` route, not changing the Square configuration.

### Emergency Alert Email `LARRY_ALERT_EMAIL`

There is only one scenario that triggers it: **Square has successfully charged → inserting the bookings row fails → the refund call also fails**. This means the customer was charged but the system neither recorded it nor can refund it, requiring manual intervention. After receiving the email, Larry should immediately:
1. Manually refund in the Square Dashboard
2. Check Railway logs to pinpoint the insert failure cause

Under normal circumstances this email should never be received in a lifetime. If you receive it, it means there's a serious bug or Supabase is down.

### Verification Method

**Sandbox test cards** (only valid when `SQUARE_ENVIRONMENT=sandbox`):
- Success: `4111 1111 1111 1111`
- Declined: `4000 0000 0000 0002`
- CVV error: `4000 0000 0000 0010`
- Expiration date any future value (like `12/26`), CVV any 3 digits, ZIP any 5 digits

**Production verification**: place an order of $20 with your own real card, confirm that the Square Dashboard `Transactions` shows `$20.00 CAPTURED`, and the `Reference ID` is `bookings.id` (a UUID). After verifying, immediately refund in the Dashboard to avoid actually spending this $20.

---

## 5. Hardcoded Values in the Code (places where code changes are needed)

In the following files, Doris's contact information is **hardcoded**; when switching to the production environment you need to confirm whether it is correct (currently it's all Doris's real information, so production actually doesn't need changes):

### Backend

| File | Location | Content |
|------|------|------|
| `backend/src/services/email.ts` | email template footer | `Doris — (916) 287-1878 — contact@dogsinfashion.com` |

### Frontend

| File | Content |
|------|------|
| `frontend/src/components/Footer.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/components/About.tsx` | `contact@dogsinfashion.com` |
| `frontend/src/components/BookingForm.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/components/BookingCTA.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/utils/calendar.ts` | `Doris — (916) 287-1878` + `contact@dogsinfashion.com` |
| `frontend/src/utils/messaging.ts` | `+19162871878` + `contact@dogsinfashion.com` |

> These hardcoded values are all Doris's real contact information; no modification is needed at go-live.
> They also don't affect development testing, since they are just contact information for display and don't participate in the actual email/SMS sending logic.

---

## 6. Complete Production backend/.env Template

```env
PORT=3001
NODE_ENV=production

# Supabase
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<unchanged>

# CORS — change to the production domain
FRONTEND_URL=https://www.dogsinfashion.com

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_KEY=<unchanged, same as development>
DORIS_CALENDAR_ID=contact@dogsinfashion.com

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx     # Generate from Resend Dashboard
DORIS_EMAIL=contact@dogsinfashion.com    # Address that receives New Booking notifications

# SMS (Twilio) — enable after completing 10DLC registration
TWILIO_ACCOUNT_SID=<see Twilio Console>
TWILIO_AUTH_TOKEN=<see Twilio Console>
TWILIO_PHONE_NUMBER=<see Twilio Console>
DORIS_PHONE=+19162871878

# Square deposit (go live with false first, then flip to true; when flipping the flag the frontend must change in sync too)
DEPOSIT_REQUIRED=false
DEPOSIT_AMOUNT_CENTS=2000
SQUARE_ACCESS_TOKEN=EAAA...              # Doris's account Production Access Token (never leak)
SQUARE_APPLICATION_ID=sq0idp-...
SQUARE_LOCATION_ID=L...
SQUARE_ENVIRONMENT=production
LARRY_ALERT_EMAIL=<your-dev-email>
```

> The Supabase Custom SMTP configuration is **not in .env**; it lives in Supabase Dashboard → Auth → SMTP Settings. If you need to change it (e.g. rotating the Resend API Key), you must change both places at the same time.

---

## 7. Switchover Checklist

When switching from development to production, do these in order:

### One-time setup (all completed now, kept for reference)
- [x] Resend account registration + `dogsinfashion.com` domain DNS verification (3 records)
- [x] Resend API Key creation → fill into `RESEND_API_KEY` in `backend/.env` + Railway environment variables
- [x] Configure Custom SMTP in the Supabase Dashboard (Host: `smtp.resend.com`, Port: 465, Username: `resend`, Password: API Key)
- [x] Paste the 3 email templates in the Supabase Dashboard (Confirm signup / Magic Link / Reset Password)
- [x] Share Doris's Google Calendar with the Service Account (Make changes to events permission)

### To confirm before each go-live
- [ ] Change `DORIS_EMAIL` in `backend/.env` to `contact@dogsinfashion.com` (in development it's Larry's email)
- [ ] Change `DORIS_CALENDAR_ID` in `backend/.env` to `contact@dogsinfashion.com`
- [ ] Change `FRONTEND_URL` in `backend/.env` to `https://www.dogsinfashion.com`
- [ ] Set `NODE_ENV=production` in `backend/.env`
- [ ] Sync the above changes to Railway environment variables
- [ ] Verify by creating a real booking: booking confirmation email ✓ / Doris notification email ✓ / calendar event ✓
- [ ] Click "Forgot password" on the login page to verify auth email: styled with the Dogs in Fashion custom template ✓

### Square deposit go-live (independent of the main app go-live, can be enabled later)
- [ ] Doris creates the `Dogs in Fashion Website` App at https://developer.squareup.com/apps
- [ ] Switch the environment to **Production**, note down the Application ID / Access Token / Location ID
- [ ] Larry fills in the 7 backend Square environment variables in Railway (`DEPOSIT_REQUIRED=false` kept off first)
- [ ] Larry fills in the 5 `VITE_SQUARE_*` frontend environment variables in the frontend hosting platform (`VITE_DEPOSIT_REQUIRED=false` kept off first)
- [ ] Run the `2026-04-10-payments.sql` migration in the Supabase production project
- [ ] Deploy once with flag=off, regression-test that the old ordering flow is completely unchanged
- [ ] Do a $20 production test order with your own real card, confirm the Square Dashboard + `bookings` + `payments` are consistent across all three → refund immediately
- [ ] Officially flip the flag: change `DEPOSIT_REQUIRED / VITE_DEPOSIT_REQUIRED` to `true` on both frontend and backend at the same time → redeploy → notify Doris

### To-do (does not block go-live)
- [ ] Complete Twilio A2P 10DLC registration → uncomment the `TWILIO_*` environment variables → fill in `DORIS_PHONE`
