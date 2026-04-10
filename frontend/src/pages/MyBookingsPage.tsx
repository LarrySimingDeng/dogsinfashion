import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, MapPin, Dog, Plus, RefreshCw } from 'lucide-react'
import DogLoader from '../components/DogLoader'
import { motion } from 'framer-motion'
import { apiFetch } from '../lib/api'
import { getServiceById, LEGACY_SERVICE_NAMES } from '../data/services'
import RescheduleModal from '../components/RescheduleModal'
import Toast, { ToastData } from '../components/Toast'

interface Booking {
  id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  dog_breed: string | null
  address: string
  notes: string | null
  status: 'confirmed' | 'completed' | 'cancelled'
  created_at: string
}

export default function MyBookingsPage() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const showToast = (message: string, type: ToastData['type'] = 'success') =>
    setToasts(prev => prev.some(t => t.message === message) ? prev : [...prev, { id: Date.now(), message, type }])

  useEffect(() => {
    apiFetch<Booking[]>('/api/bookings')
      .then(data => setBookings(data.sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time))))
      .catch((err) => {
        console.error('Failed to fetch bookings:', err)
        setError(err.message || 'Failed to load bookings')
      })
      .finally(() => setLoading(false))
  }, [])

  // Cancel functionality disabled — we prefer customers not to self-cancel
  // const handleCancel = async (id: string) => {
  //   if (!confirm('Are you sure you want to cancel this booking?')) return
  //   try {
  //     await apiFetch(`/api/bookings/${id}/status`, {
  //       method: 'PATCH',
  //       body: JSON.stringify({ status: 'cancelled' }),
  //     })
  //     setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
  //   } catch {
  //     alert('Failed to cancel booking')
  //   }
  // }

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const upcoming = bookings.filter(b => b.date >= today && b.status !== 'cancelled').reverse()
  const past = bookings.filter(b => b.date < today || b.status === 'cancelled')

  const statusColors: Record<string, string> = {
    confirmed: 'bg-secondary/10 text-secondary',
    completed: 'bg-sage-light text-sage',
    cancelled: 'bg-red-50 text-red-500',
  }

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h! >= 12 ? 'PM' : 'AM'
    const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
    return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
  }

  const BookingCard = ({ booking, showReschedule }: { booking: Booking; showReschedule?: boolean }) => {
    const service = getServiceById(booking.service_id)
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-3xl bg-white shadow-soft transition-shadow hover:shadow-elevated"
      >
        {/* Thin accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-secondary via-sky-deep to-sky" />

        <div className="p-5">
          {/* Header row: service name + price */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-warm-dark">
              {service?.name || LEGACY_SERVICE_NAMES[booking.service_id] || booking.service_id}
            </h3>
            {service && (
              <span className="font-display text-2xl font-bold text-primary/70">
                ${service.price}
              </span>
            )}
          </div>

          {/* Two-column layout: details left, badge + action right */}
          <div className="flex gap-5">
            {/* Details */}
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="font-semibold text-warm-dark">Date</span>
                <span className="text-warm-gray">{new Date(booking.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="font-semibold text-warm-dark">Time</span>
                <span className="text-warm-gray">{formatTime(booking.start_time)} — {formatTime(booking.end_time)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Dog className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="font-semibold text-warm-dark">Dog Name</span>
                <span className="text-warm-gray">{booking.dog_name}{booking.dog_breed ? ` (${booking.dog_breed})` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="font-semibold text-warm-dark">Address</span>
                <span className="text-warm-gray">{booking.address}</span>
              </div>
            </div>

            {/* Right column: badge + reschedule */}
            <div className="flex shrink-0 flex-col items-end justify-between">
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${statusColors[booking.status]}`}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </span>
              {showReschedule && (
                <button
                  onClick={() => setRescheduleBooking(booking)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reschedule
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background pt-20">
        <DogLoader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-6 pb-20 pt-28">
      <div className="mx-auto max-w-[720px]">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-warm-dark">My Bookings</h1>
          <button
            onClick={() => navigate('/book')}
            className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <Plus className="h-4 w-4" /> New Booking
          </button>
        </div>

        {error ? (
          <div className="rounded-3xl bg-red-50 p-8 text-center">
            <p className="mb-2 font-semibold text-red-600">Error loading bookings</p>
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); apiFetch<Booking[]>('/api/bookings').then(setBookings).catch(e => setError(e.message)).finally(() => setLoading(false)) }}
              className="mt-4 rounded-full bg-secondary px-5 py-2 text-sm font-bold text-white"
            >
              Retry
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-soft">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-sky-deep" />
            <h2 className="mb-2 font-display text-xl font-bold text-warm-dark">No bookings yet</h2>
            <p className="mb-6 text-warm-gray">Book your first grooming appointment!</p>
            <button
              onClick={() => navigate('/book')}
              className="rounded-full bg-secondary px-7 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              Book Now
            </button>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-secondary">
                  Upcoming
                </h2>
                <div className="space-y-4">
                  {upcoming.map(b => <BookingCard key={b.id} booking={b} showReschedule={b.status === 'confirmed'} />)}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-warm-gray">
                  Past
                </h2>
                <div className="space-y-4">
                  {past.map(b => <BookingCard key={b.id} booking={b} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {rescheduleBooking && (
        <RescheduleModal
          booking={rescheduleBooking}
          onClose={() => setRescheduleBooking(null)}
          onRescheduled={(updated) => {
            setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
            setRescheduleBooking(null)
            showToast('Booking rescheduled successfully!')
          }}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
