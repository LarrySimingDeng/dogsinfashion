# Dogs in Fashion — Infrastructure & Deployment Guide

> Last updated: 2026-04-09

---

## 1. System Architecture Overview

```
User browser
    │
    ▼
┌─────────────────────────────┐
│  Vercel (frontend)           │
│  React + Vite + Tailwind    │
│  Domain: www.dogsinfashion.com │
└─────────────┬───────────────┘
              │ API requests
              ▼
┌──────────────────────────────────────────┐
│  Railway (backend)                         │
│  Express + TypeScript                     │
│  Domain: dogsinfashion-production.up.railway.app │
└──────┬──────────┬───────────┬────────────┘
       │          │           │
       ▼          ▼           ▼
   Supabase   Google Cal   Gmail SMTP
   (database+auth)  (calendar sync)   (email notifications)
```

| Component | Platform | URL |
|------|------|-----|
| **Frontend** | Vercel | https://dogsinfashion-frontend.vercel.app |
| **Backend** | Railway | https://dogsinfashion-production.up.railway.app |
| **Database + Auth** | Supabase | https://supabase.com/dashboard |
| **Code Repository** | GitHub | https://github.com/arianapan/dogsinfashion |
| **DNS** | Squarespace | www.dogsinfashion.com |

---

## 2. Project Structure

The frontend and backend are **completely independent npm projects** (no workspace); each has its own `package.json` and `package-lock.json`, and they are deployed to different platforms.

```
dogsinfashion/
├── package.json              # Root directory (only concurrently, to conveniently start frontend and backend locally at the same time)
├── .npmrc                    # Specifies the public npm registry
├── frontend/                 # → Deployed to Vercel
│   ├── package.json
│   ├── .node-version         # Specifies Node 20
│   ├── vercel.json           # SPA rewrite
│   └── src/
└── backend/                  # → Deployed to Railway
    ├── package.json
    ├── package-lock.json
    ├── railway.toml           # Railway build configuration
    └── src/
```

---

## 3. Automatic Deployment Flow

**Every push to the `main` branch triggers an automatic redeploy on both Vercel and Railway.**

```
Edit code locally → git commit → git push origin main
                                  │
                    ┌──────────────┼──────────────┐
                    ▼                             ▼
              Vercel builds automatically                Railway builds automatically
              (frontend, ~30-60 seconds)              (backend, ~1-2 minutes)
```

No manual steps required; pushing goes live.

---

## 4. Vercel Frontend Configuration

### Build Settings

| Setting | Value |
|--------|-----|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` (default) |
| Install Command | `npm install` (default) |
| Node.js Version | 20.x (via `frontend/.node-version`) |

### Environment Variables (in Vercel Dashboard → Settings → Environment Variables)

| Variable Name | Value | Description |
|--------|-----|------|
| `VITE_SUPABASE_URL` | `https://<your-project>.supabase.co` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase public key |
| `VITE_API_URL` | `https://dogsinfashion-production.up.railway.app` | Backend address |

### Manual Redeploy

Vercel Dashboard → Deployments → most recent deployment → `...` → Redeploy

---

## 5. Railway Backend Configuration

### Build Settings

Configured via `backend/railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "node dist/index.js"
```

| Setting | Value |
|--------|-----|
| Root Directory | `backend` |
| Builder | Nixpacks |

### Environment Variables (in Railway Dashboard → Variables)

| Variable Name | Description |
|--------|------|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://www.dogsinfashion.com` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side secret key |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | GCP Service Account JSON |
| `DORIS_CALENDAR_ID` | Calendar ID (Gmail address) |
| `SMTP_USER` / `SMTP_PASS` / `DORIS_EMAIL` | Email configuration |

### Manual Redeploy

Railway Dashboard → Deployments → Redeploy

---

## 6. Local Development

```bash
# Install dependencies for the first time
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
npm install    # Root directory only installs concurrently

# Start (start frontend 5173 + backend 3001 at the same time)
npm run dev

# Start separately
npm run dev:fe
npm run dev:be
```

Local environment variables:
- `frontend/.env.local` — frontend (leave `VITE_API_URL` empty; the vite proxy will forward to 3001)
- `backend/.env` — backend

These two files are in `.gitignore` and will not be pushed to GitHub.

---

## 7. Routine Maintenance

| Operation | How to do it |
|------|--------|
| Ship code changes | `git commit` → `git push` → automatic deploy |
| Change environment variables | Railway/Vercel Dashboard → Variables → edit and save |
| View backend logs | Railway Dashboard → service → Deployments → View Logs |
| View booking data | Supabase Dashboard → Table Editor → `bookings` |
| View users | Supabase Dashboard → Authentication → Users |
| Roll back a deployment | Dashboard → Deployments → find a previously successful one → Redeploy |

---

## 8. Cost

| Platform | Cost |
|------|------|
| Vercel | Free (Hobby plan) |
| Railway | Trial includes $5 of credit; after it expires, Hobby plan $5/month |
| Supabase | Free (Free tier) |
| Squarespace | Domain renewal (already owned) |

---

## 9. Secret Security

- `.env` files are never committed to GitHub (already in `.gitignore`)
- All secrets exist only in Railway / Vercel environment variables (encrypted storage)
- If a secret is leaked and needs to be rotated:
  - Gmail App Password → https://myaccount.google.com/apppasswords
  - GCP Service Account Key → Google Cloud Console → IAM → Service Accounts
  - Supabase Key → Supabase Dashboard → Settings → API
