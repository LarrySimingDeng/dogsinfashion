import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import type { AuthRequest } from '../types.js'

export const authRouter = Router()

authRouter.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.user })
})
