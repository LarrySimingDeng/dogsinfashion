import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import { authRouter } from './routes/auth.js'
import { bookingsRouter } from './routes/bookings.js'
import { availabilityRouter } from './routes/availability.js'
import { remindersRouter } from './routes/reminders.js'
import { petsRouter } from './routes/pets.js'
import { adminUsersRouter } from './routes/admin-users.js'

export const app = express()

// Middleware
app.use(helmet())
app.use(cors({
  origin: [
    config.FRONTEND_URL,
    'https://dogsinfashion-frontend.vercel.app',
  ],
  credentials: true,
}))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/availability', availabilityRouter)
app.use('/api/reminders', remindersRouter)
app.use('/api/pets', petsRouter)
app.use('/api/admin/users', adminUsersRouter)
