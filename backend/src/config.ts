import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Google Calendar (optional — degrades gracefully)
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  DORIS_CALENDAR_ID: z.string().default('dogsinfashionca@gmail.com'),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  DORIS_EMAIL: z.string().default('dogsinfashionca@gmail.com'),

  // Twilio SMS (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  DORIS_PHONE: z.string().default('+19162871878'),
})

function loadConfig() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  return parsed.data
}

export const config = loadConfig()
