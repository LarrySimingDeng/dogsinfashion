import { createClient } from '@supabase/supabase-js'

// Capture recovery flag from URL hash BEFORE createClient runs,
// because createClient will auto-process and clear the hash.
export const isRecoveryLink =
  typeof window !== 'undefined' &&
  window.location.hash.includes('type=recovery')

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing — auth features will not work')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
)
