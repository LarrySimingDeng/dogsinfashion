import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // getSession() reads from cache and may return an expired token.
  // If expired, try refreshSession() first to get a fresh token.
  let { data: { session } } = await supabase.auth.getSession()

  if (session?.expires_at && session.expires_at * 1000 <= Date.now()) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    // If 401 and we haven't retried yet, force a token refresh and retry once
    if (res.status === 401 && !options.headers?.['X-Retry']) {
      const { data } = await supabase.auth.refreshSession()
      if (data.session?.access_token) {
        return apiFetch<T>(path, {
          ...options,
          headers: { ...options.headers as Record<string, string>, 'X-Retry': '1' },
        })
      }
    }
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}
