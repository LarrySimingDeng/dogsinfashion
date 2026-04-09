import type { Response, NextFunction } from 'express'
import { supabaseAdmin } from '../services/supabase.js'
import type { AuthRequest } from '../types.js'

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' })
    return
  }

  const token = header.slice(7)

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // Get profile with role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  req.user = {
    id: user.id,
    email: user.email ?? '',
    role: (profile?.role as 'client' | 'admin') ?? 'client',
  }

  next()
}
