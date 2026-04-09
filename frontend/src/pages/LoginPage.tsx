import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PawPrint } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/book'

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to={from} replace />
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({ email })
    if (err) {
      setError(err.message)
    } else {
      setStep('otp')
    }
    setLoading(false)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    if (err) {
      setError(err.message)
    }
    // Auth state change listener will handle redirect
    setLoading(false)
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky via-background to-butter px-6">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-10 shadow-elevated">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10">
            <PawPrint className="h-7 w-7 text-secondary" />
          </div>
          <h1 className="mb-2 font-display text-2xl font-bold text-warm-dark">
            Welcome Back
          </h1>
          <p className="text-sm text-warm-gray">
            Sign in to book your grooming appointment
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Google Login */}
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

        {/* Email OTP */}
        {step === 'email' ? (
          <form onSubmit={handleSendOtp}>
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
              className="mt-4 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <p className="mb-3 text-sm text-warm-gray">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
              Verification Code
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={8}
              className={`${inputClass} text-center text-lg tracking-[0.2em]`}
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-full bg-secondary py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp('') }}
              className="mt-3 w-full text-center text-sm text-secondary hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-warm-gray">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  )
}
