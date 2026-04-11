import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../services/supabase.js'
import type { AuthRequest } from '../types.js'

export const petsRouter = Router()

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const petCreateSchema = z.object({
  name: z.string().min(1).max(60),
  breed: z.string().max(80).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // photo_url is rarely sent on create — the frontend does
  // "create pet → upload photo → PATCH photo_url". Accepted here for
  // completeness / future server-side seeding.
  photo_url: z.string().url().optional(),
  care_notes: z.string().max(2000).optional(),
})

const petUpdateSchema = petCreateSchema.partial()

const petAdminUpdateSchema = petUpdateSchema.extend({
  groomer_notes: z.string().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// Column whitelist for client responses. groomer_notes is deliberately
// excluded here so owners never see it, even if a bug elsewhere tries to
// leak it. Admin responses use '*'. KEEP IN SYNC with the pets table.
// ---------------------------------------------------------------------------
const CLIENT_PET_COLUMNS =
  'id,user_id,name,breed,size,birthday,photo_url,care_notes,archived_at,created_at,updated_at'

type PetRow = {
  id: string
  user_id: string
  name: string
  breed: string | null
  size: 'small' | 'medium' | 'large' | null
  birthday: string | null
  photo_url: string | null
  care_notes: string | null
  groomer_notes?: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Helper: turn a public pet-photos URL into the bucket-relative path,
// mirrors the frontend helper so the DELETE route can clean up storage.
// ---------------------------------------------------------------------------
function photoUrlToPath(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = '/pet-photos/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// ---------------------------------------------------------------------------
// GET /api/pets
//   - client: returns caller's non-archived pets
//   - admin:  if ?user_id=xxx present, returns that user's non-archived pets;
//             otherwise returns an empty list (admins should scope by user)
// ---------------------------------------------------------------------------
petsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin'
  const queryUserId = typeof req.query.user_id === 'string' ? req.query.user_id : undefined

  let targetUserId: string
  if (isAdmin && queryUserId) {
    targetUserId = queryUserId
  } else if (isAdmin && !queryUserId) {
    // Admin with no filter: return empty list instead of leaking everyone's pets.
    res.json([])
    return
  } else {
    targetUserId = req.user!.id
  }

  const { data, error } = await supabaseAdmin
    .from('pets')
    .select(isAdmin ? '*' : CLIENT_PET_COLUMNS)
    .eq('user_id', targetUserId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .returns<PetRow[]>()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data ?? [])
})

// ---------------------------------------------------------------------------
// GET /api/pets/:id
//   Returns the pet + booking_history (all bookings with matching pet_id,
//   sorted date desc, start_time desc).
// ---------------------------------------------------------------------------
petsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin'

  const { data: pet, error } = await supabaseAdmin
    .from('pets')
    .select(isAdmin ? '*' : CLIENT_PET_COLUMNS)
    .eq('id', req.params.id)
    .is('archived_at', null)
    .single<PetRow>()

  if (error || !pet) {
    res.status(404).json({ error: 'Pet not found' })
    return
  }

  if (!isAdmin && pet.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Pet not found' })
    return
  }

  const { data: bookings, error: bookingsErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('pet_id', req.params.id)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (bookingsErr) {
    console.error('[pets] fetch booking history failed:', bookingsErr)
  }

  res.json({ ...pet, booking_history: bookings ?? [] })
})

// ---------------------------------------------------------------------------
// POST /api/pets
// ---------------------------------------------------------------------------
petsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = petCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const isAdmin = req.user!.role === 'admin'

  const { data: pet, error } = await supabaseAdmin
    .from('pets')
    .insert({
      user_id: req.user!.id,
      name: parsed.data.name,
      breed: parsed.data.breed ?? null,
      size: parsed.data.size ?? null,
      birthday: parsed.data.birthday ?? null,
      photo_url: parsed.data.photo_url ?? null,
      care_notes: parsed.data.care_notes ?? null,
    })
    .select(isAdmin ? '*' : CLIENT_PET_COLUMNS)
    .single<PetRow>()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json(pet)
})

// ---------------------------------------------------------------------------
// PATCH /api/pets/:id
//   Single handler, schema branches on role so admins can also update
//   groomer_notes while owners silently cannot.
// ---------------------------------------------------------------------------
petsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin'
  const schema = isAdmin ? petAdminUpdateSchema : petUpdateSchema

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  // Fetch existing pet first to check ownership and archived state.
  const { data: existing } = await supabaseAdmin
    .from('pets')
    .select('*')
    .eq('id', req.params.id)
    .is('archived_at', null)
    .single()

  if (!existing) {
    res.status(404).json({ error: 'Pet not found' })
    return
  }

  if (!isAdmin && existing.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Pet not found' })
    return
  }

  // Build partial update payload with only the keys the schema accepted.
  // This way missing keys don't clobber existing values with null.
  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.breed !== undefined) update.breed = parsed.data.breed ?? null
  if (parsed.data.size !== undefined) update.size = parsed.data.size ?? null
  if (parsed.data.birthday !== undefined) update.birthday = parsed.data.birthday ?? null
  if (parsed.data.photo_url !== undefined) update.photo_url = parsed.data.photo_url ?? null
  if (parsed.data.care_notes !== undefined) update.care_notes = parsed.data.care_notes ?? null
  if (isAdmin && 'groomer_notes' in parsed.data && parsed.data.groomer_notes !== undefined) {
    update.groomer_notes = parsed.data.groomer_notes ?? null
  }

  if (Object.keys(update).length === 0) {
    res.json(existing)
    return
  }

  const { data: updated, error } = await supabaseAdmin
    .from('pets')
    .update(update)
    .eq('id', req.params.id)
    .select(isAdmin ? '*' : CLIENT_PET_COLUMNS)
    .single<PetRow>()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /api/pets/:id
//   Soft delete: set archived_at. Owner or admin can delete. Uses a single
//   atomic update so "not my pet" (non-admin) and "already archived" cases
//   return 404 consistently, without leaking existence information.
// ---------------------------------------------------------------------------
petsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin'

  let query = supabaseAdmin
    .from('pets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .is('archived_at', null)

  if (!isAdmin) {
    query = query.eq('user_id', req.user!.id)
  }

  const { data, error } = await query.select('id, photo_url').maybeSingle()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  if (!data) {
    // Either the pet doesn't exist, isn't owned by this user, or is already
    // archived. Consistent 404 for all cases so we don't leak existence.
    res.status(404).json({ error: 'Pet not found' })
    return
  }

  // Fire-and-forget storage cleanup so old files don't pile up.
  const path = photoUrlToPath(data.photo_url)
  if (path) {
    supabaseAdmin.storage
      .from('pet-photos')
      .remove([path])
      .catch((err: unknown) => console.error('[pets] photo cleanup failed:', err))
  }

  res.status(204).send()
})
