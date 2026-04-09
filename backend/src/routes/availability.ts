import { Router } from 'express'
import { z } from 'zod'
import { getAvailableSlots } from '../services/slots.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { supabaseAdmin } from '../services/supabase.js'
import type { AuthRequest } from '../types.js'

export const availabilityRouter = Router()

// Get available time slots for a date + service
availabilityRouter.get('/slots', async (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceId: z.string().min(1),
    excludeBookingId: z.string().uuid().optional(),
  })

  const parsed = schema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() })
    return
  }

  const slots = await getAvailableSlots(parsed.data.date, parsed.data.serviceId, parsed.data.excludeBookingId)
  res.json({ slots })
})

// Get full schedule (admin)
availabilityRouter.get('/schedule', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  const { data: availability } = await supabaseAdmin
    .from('availability')
    .select('*')
    .order('day_of_week')

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates')
    .select('*')
    .order('date')

  res.json({ availability: availability ?? [], blockedDates: blockedDates ?? [] })
})

// Update schedule (admin)
availabilityRouter.put('/schedule', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const schema = z.array(z.object({
    id: z.string().uuid(),
    day_of_week: z.number().min(0).max(6),
    start_time: z.string(),
    end_time: z.string(),
    is_active: z.boolean(),
  }))

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() })
    return
  }

  for (const item of parsed.data) {
    await supabaseAdmin
      .from('availability')
      .update({
        start_time: item.start_time,
        end_time: item.end_time,
        is_active: item.is_active,
      })
      .eq('id', item.id)
  }

  res.json({ ok: true })
})

// Add blocked date (admin)
availabilityRouter.post('/blocked-dates', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .insert({ date: parsed.data.date, reason: parsed.data.reason ?? null })
    .select()
    .single()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(201).json(data)
})

// Delete blocked date (admin)
availabilityRouter.delete('/blocked-dates/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin
    .from('blocked_dates')
    .delete()
    .eq('id', req.params.id)

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.json({ ok: true })
})
