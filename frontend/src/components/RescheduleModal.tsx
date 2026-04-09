import { useState } from 'react'
import { X, Calendar, Clock } from 'lucide-react'
import SlotPicker from './SlotPicker'
import { apiFetch } from '../lib/api'

interface Booking {
  id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  dog_breed: string | null
  status: 'confirmed' | 'completed' | 'cancelled'
}

interface Props {
  booking: Booking
  onClose: () => void
  onRescheduled: (updated: Booking) => void
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
}

export default function RescheduleModal({ booking, onClose, onRescheduled }: Props) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const currentDateDisplay = new Date(booking.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) return
    setSubmitting(true)
    setError('')

    try {
      const updated = await apiFetch<Booking>(`/api/bookings/${booking.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ date: selectedDate, start_time: selectedTime }),
      })
      onRescheduled(updated)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reschedule'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-warm-dark">Reschedule Appointment</h2>
            <p className="mt-1 text-sm text-warm-gray">{booking.dog_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-sky/40">
            <X className="h-5 w-5 text-warm-gray" />
          </button>
        </div>

        {/* Current booking info */}
        <div className="mb-5 rounded-xl bg-sky/20 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-warm-gray">Current Appointment</p>
          <div className="flex items-center gap-4 text-sm text-warm-dark">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {currentDateDisplay}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(booking.start_time)}
            </span>
          </div>
        </div>

        {/* Slot Picker */}
        <div className="mb-5">
          <p className="mb-3 text-sm font-semibold text-warm-dark">Select a new date & time:</p>
          <SlotPicker
            serviceId={booking.service_id}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onDateChange={d => { setSelectedDate(d); setSelectedTime(''); setError('') }}
            onTimeChange={t => { setSelectedTime(t); setError('') }}
            excludeBookingId={booking.id}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border-2 border-sky px-4 py-2.5 text-sm font-bold text-warm-dark transition-colors hover:bg-sky/20"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedTime || submitting}
            className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
