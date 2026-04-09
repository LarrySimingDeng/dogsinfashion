import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

// Admin client with service_role_key — bypasses RLS
export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
)
