import { useState, useEffect, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PawPrint, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Toast, { type ToastData } from '../components/Toast'

type Mode = 'login' | 'signup' | 'forgot' | 'resetPassword'

export default function LoginPage() {
  const { user, isRecovery, clearRecovery } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ||
    '/book'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastData[]>([])
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const showToast = (message: string, type: ToastData['type'] = 'success') =>
    setToasts(prev => prev.some(t => t.message === message) ? prev : [...prev, { id: Date.now(), message, type }])

  useEffect(() => {
    if (isRecovery) {
      setMode('resetPassword')
    }
  }, [isRecovery])

  if (user && !isRecovery) {
    return <Navigate to={from} replace />
  }

  const resetForm = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    setShowPassword(false)
  }

  const switchMode = (m: Mode) => {
    resetForm()
    setMode(m)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { error: err } = await supabase.auth.signUp({ email, password })
    if (err) {
      setError(err.message)
    } else {
      showToast('Account created successfully! Please check your email to confirm, then sign in.', 'success')
      switchMode('login')
    }
    setLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (err) {
      setError(err.message)
    } else {
      showToast('Password reset link sent! Please check your email.', 'info')
    }
    setLoading(false)
  }

  const handleCancelReset = async () => {
    // User clicked the recovery email link but changed their mind.
    // Supabase already built a session from the recovery token, so
    // sign out to prevent a stealth login, then return to the login form.
    await supabase.auth.signOut()
    clearRecovery()
    switchMode('login')
    showToast('Password reset cancelled', 'info')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      showToast('Password updated successfully! Redirecting...', 'success')
      // Delay so the user can actually see the toast on this page,
      // then clear the recovery flag — the <Navigate> at the top of
      // LoginPage will take over and SPA-navigate to `from`. No hard
      // reload, no flicker.
      setTimeout(() => {
        clearRecovery()
      }, 1500)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${from}`,
      },
    })
    if (err) {
      setError(err.message)
    }
  }

  const inputClass =
    'w-full rounded-xl border-2 border-sky bg-cream px-4 py-3 font-body text-[0.95rem] text-warm-dark outline-none transition-colors focus:border-secondary'

  const title = {
    login: 'Welcome Back',
    signup: 'Create Account',
    forgot: 'Forgot Password',
    resetPassword: 'Set New Password',
  }[mode]

  const subtitle = {
    login: 'Sign in to book your grooming appointment',
    signup: 'Sign up to book your grooming appointment',
    forgot: 'Enter your email and we\'ll send a reset link',
    resetPassword: 'Enter your new password below',
  }[mode]

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky via-background to-butter px-6">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-10 shadow-elevated">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10">
            <PawPrint className="h-7 w-7 text-secondary" />
          </div>
          <h1 className="mb-2 font-display text-2xl font-bold text-warm-dark">
            {title}
          </h1>
          <p className="text-sm text-warm-gray">{subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Google Login - only on login & signup */}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <button
              onClick={handleGoogleLogin}
              className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-sky bg-white px-4 py-3 font-semibold text-warm-dark transition-colors hover:bg-sky/30"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-sky" />
              <span className="text-xs font-semibold text-warm-gray">or</span>
              <div className="h-px flex-1 bg-sky" />
            </div>
          </>
        )}

        {/* Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              required
            />
            <label className="mb-1.5 mt-4 block text-sm font-semibold text-warm-dark">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`${inputClass} pr-12`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-warm-dark"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="mt-2 text-sm text-secondary hover:underline"
            >
              Forgot password?
            </button>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p className="mt-4 text-center text-sm text-warm-gray">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-semibold text-secondary hover:underline"
              >
                Sign up
              </button>
            </p>
          </form>
        )}

        {/* Sign Up Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp}>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              required
            />
            <label className="mb-1.5 mt-4 block text-sm font-semibold text-warm-dark">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={`${inputClass} pr-12`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-warm-dark"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <label className="mb-1.5 mt-4 block text-sm font-semibold text-warm-dark">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className={inputClass}
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            <p className="mt-4 text-center text-sm text-warm-gray">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-secondary hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* Forgot Password Form */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="mt-3 w-full text-center text-sm text-secondary hover:underline"
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* Reset Password Form (after clicking reset link in email) */}
        {mode === 'resetPassword' && (
          <form onSubmit={handleResetPassword}>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={`${inputClass} pr-12`}
                required
                minLength={6}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-warm-dark"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <label className="mb-1.5 mt-4 block text-sm font-semibold text-warm-dark">
              Confirm New Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className={inputClass}
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={handleCancelReset}
              disabled={loading}
              className="mt-3 w-full text-center text-sm text-secondary hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-warm-gray">
          By signing in, you agree to our terms of service.
        </p>
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
