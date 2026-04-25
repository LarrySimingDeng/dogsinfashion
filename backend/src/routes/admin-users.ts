import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { supabaseAdmin } from '../services/supabase.js'
import type { AuthRequest } from '../types.js'

export const adminUsersRouter = Router()

const querySchema = z.object({
  search: z.string().max(200).optional(),
})

// GET /api/admin/users?search=...
//
// Returns up to 20 registered customers (role !== 'admin') for the admin
// "Create Booking" tab. `latest_phone` comes from the user's most recent
// bookings.phone — profiles.phone is rarely populated (no edit-profile UI).
//
// TODO: when total users exceed ~1000 or bookings exceed ~5000, replace the
// in-memory join with a SQL-side RPC / paginated query.
adminUsersRouter.get('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() })
    return
  }
  const search = parsed.data.search?.trim().toLowerCase() ?? ''

  // 1. All auth users (email lives here)
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (authErr) {
    res.status(500).json({ error: authErr.message })
    return
  }

  // 2. All profiles (name / role / default_address)
  const { data: profiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, name, role, default_address')
  if (profErr) {
    res.status(500).json({ error: profErr.message })
    return
  }
  const profileById = new Map<string, { name: string | null; role: string | null; default_address: string | null }>()
  for (const p of profiles ?? []) {
    profileById.set(p.id as string, {
      name: (p.name as string | null) ?? null,
      role: (p.role as string | null) ?? null,
      default_address: (p.default_address as string | null) ?? null,
    })
  }

  // 3. Latest phone per user from bookings
  const { data: phoneRows, error: phoneErr } = await supabaseAdmin
    .from('bookings')
    .select('user_id, phone, created_at')
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })
  if (phoneErr) {
    res.status(500).json({ error: phoneErr.message })
    return
  }
  const latestPhoneByUser = new Map<string, string>()
  for (const row of phoneRows ?? []) {
    const uid = row.user_id as string
    if (!latestPhoneByUser.has(uid)) {
      latestPhoneByUser.set(uid, row.phone as string)
    }
  }

  // 4. Join + filter (skip admins, apply search, cap 20)
  type ResultUser = {
    id: string
    email: string
    name: string | null
    default_address: string | null
    latest_phone: string | null
  }
  const out: ResultUser[] = []
  for (const u of authData.users) {
    const prof = profileById.get(u.id)
    if (prof?.role === 'admin') continue
    const email = u.email ?? ''
    const name = prof?.name ?? null
    if (search) {
      const hay = `${email} ${name ?? ''}`.toLowerCase()
      if (!hay.includes(search)) continue
    }
    out.push({
      id: u.id,
      email,
      name,
      default_address: prof?.default_address ?? null,
      latest_phone: latestPhoneByUser.get(u.id) ?? null,
    })
    if (out.length >= 20) break
  }

  res.json({ users: out })
})
