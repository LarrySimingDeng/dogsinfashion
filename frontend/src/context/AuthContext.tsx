import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isRecoveryLink } from '../lib/supabase'

interface Profile {
  id: string
  name: string
  phone: string | null
  avatar_url: string | null
  role: 'client' | 'admin'
  default_address: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isRecovery: boolean
  clearRecovery: () => void
  /**
   * Re-fetch the current user's profile row from the database.
   * Call this after any write that changes profile fields (e.g. default_address)
   * so dependent pages see the new value without requiring a full page reload.
   */
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isRecovery: false,
  clearRecovery: () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecovery, setIsRecovery] = useState(isRecoveryLink)

  const clearRecovery = useCallback(() => setIsRecovery(false), [])

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile(data as Profile | null)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        if (!mounted) return
        setSession(s)
        setUser(s?.user ?? null)
        // No user → no profile to wait for; release the loading gate now.
        // With a user, the profile effect below clears isLoading.
        if (!s?.user) setIsLoading(false)
      })
      .catch(err => {
        console.error('Failed to get initial session:', err)
        if (mounted) setIsLoading(false)
      })

    // Keep this callback synchronous. Awaiting a Supabase call here
    // deadlocks the auth lock during TOKEN_REFRESHED on returning visits.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecovery(true)
        }
        setSession(s)
        setUser(s?.user ?? null)
        if (!s?.user) {
          setProfile(null)
          setIsLoading(false)
        }
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Profile fetch lives outside onAuthStateChange to avoid the auth-lock
  // deadlock. It also owns clearing isLoading on the "has user" path.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (!cancelled) setProfile(data as Profile | null)
      } catch (err) {
        console.error('Failed to fetch profile:', err)
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }, [user?.id, fetchProfile])

  const signOut = useCallback(async () => {
    // Clear local state immediately so the UI updates even if the network
    // logout hangs or 403s (expired refresh token).
    setUser(null)
    setSession(null)
    setProfile(null)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, profile, isLoading, isRecovery, clearRecovery, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
