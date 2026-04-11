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
  DORIS_CALENDAR_ID: z.string().default('contact@dogsinfashion.com'),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  DORIS_EMAIL: z.string().default('contact@dogsinfashion.com'),

  // Twilio SMS (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  DORIS_PHONE: z.string().default('+19162871878'),

  // Square Payments (optional + feature-flagged)
  // ⚠️ DEPOSIT_REQUIRED must use enum+transform, NOT z.coerce.boolean()
  // because Boolean("false") === true (any non-empty string is truthy).
  DEPOSIT_REQUIRED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  DEPOSIT_AMOUNT_CENTS: z.coerce.number().int().positive().default(2000),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_APPLICATION_ID: z.string().optional(),
  SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  LARRY_ALERT_EMAIL: z.string().email().optional(),
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
