import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { supabaseAdmin } from '../services/supabase.js'
import type { AuthRequest } from '../types.js'

export const remindersRouter = Router()

// Defaults used when no settings row exists yet
const DEFAULTS = {
  email_enabled: true,
  email_hours_before: 24,
  sms_enabled: true,
  sms_hours_before: 2,
}

// GET /api/reminders/settings — admin only
remindersRouter.get('/settings', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  const { data } = await supabaseAdmin
    .from('reminder_settings')
    .select('*')
    .limit(1)
    .single()

  res.json(data ?? DEFAULTS)
})

// PUT /api/reminders/settings — admin only
remindersRouter.put('/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { email_enabled, email_hours_before, sms_enabled, sms_hours_before } = req.body

  // Validate
  if (typeof email_enabled !== 'boolean' || typeof sms_enabled !== 'boolean') {
    res.status(400).json({ error: 'email_enabled and sms_enabled must be booleans' })
    return
  }
  if (typeof email_hours_before !== 'number' || email_hours_before < 1 || email_hours_before > 168) {
    res.status(400).json({ error: 'email_hours_before must be 1-168' })
    return
  }
  if (typeof sms_hours_before !== 'number' || sms_hours_before < 1 || sms_hours_before > 168) {
    res.status(400).json({ error: 'sms_hours_before must be 1-168' })
    return
  }

  const settings = { email_enabled, email_hours_before, sms_enabled, sms_hours_before }

  // Upsert: try update first, insert if no rows exist
  const { data: existing } = await supabaseAdmin
    .from('reminder_settings')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('reminder_settings')
      .update(settings)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.json(data)
  } else {
    const { data, error } = await supabaseAdmin
      .from('reminder_settings')
      .insert(settings)
      .select()
      .single()
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.json(data)
  }
})
