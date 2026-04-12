import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { apiFetch } from '../lib/api'

interface TimeSlot {
  start: string
  end: string
}

interface Props {
  serviceId: string
  selectedDate: string
  selectedTime: string
  onDateChange: (date: string) => void
  onTimeChange: (time: string) => void
  excludeBookingId?: string
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  for (let d = first; d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SlotPicker({ serviceId, selectedDate, selectedTime, onDateChange, onTimeChange, excludeBookingId }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const days = getDaysInMonth(viewYear, viewMonth)
  const firstDow = days[0]!.getDay()

  // Max date: 30 days from now
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + 30)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // Fetch slots when date or service changes
  useEffect(() => {
    if (!selectedDate || !serviceId) {
      setSlots([])
      return
    }

    let cancelled = false
    const controller = new AbortController()

    setLoadingSlots(true)
    const url = `/api/availability/slots?date=${selectedDate}&serviceId=${serviceId}${excludeBookingId ? `&excludeBookingId=${excludeBookingId}` : ''}`
    apiFetch<{ slots: TimeSlot[] }>(
      url,
      { signal: controller.signal },
    )
      .then(data => { if (!cancelled) setSlots(data.slots) })
      .catch(() => { if (!cancelled) setSlots([]) })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedDate, serviceId, excludeBookingId])

  const formatTimeDisplay = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const ampm = h! >= 12 ? 'PM' : 'AM'
    const displayH = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
    return `${displayH}:${String(m!).padStart(2, '0')} ${ampm}`
  }

  const canGoPrev = viewYear > today.getFullYear() || viewMonth > today.getMonth()

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            disabled={!canGoPrev}
            className="rounded-lg p-1.5 hover:bg-sky/40 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-warm-dark">
            {new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg p-1.5 hover:bg-sky/40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-warm-gray">
          {WEEKDAY_LABELS.map(d => <div key={d} className="py-1">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map(day => {
            const dateStr = formatDate(day)
            const isPast = day < today
            const isFuture = day > maxDate
            const isSelected = dateStr === selectedDate
            const disabled = isPast || isFuture

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => { onDateChange(dateStr); onTimeChange('') }}
                disabled={disabled}
                className={`rounded-lg py-2 text-sm transition-colors ${
                  isSelected
                    ? 'bg-secondary font-bold text-white'
                    : disabled
                      ? 'text-warm-gray/40'
                      : 'font-medium text-warm-dark hover:bg-sky/40'
                }`}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time Slots */}
      {selectedDate && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-warm-dark">
            Available Times for{' '}
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </h4>

          {loadingSlots ? (
            <div className="flex items-center gap-2 text-sm text-warm-gray">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
              Loading available times...
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-warm-gray">No available times for this date. Please try another day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map(slot => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => onTimeChange(slot.start)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    selectedTime === slot.start
                      ? 'bg-secondary font-bold text-white'
                      : 'bg-sky/30 text-warm-dark hover:bg-sky/60'
                  }`}
                >
                  {formatTimeDisplay(slot.start)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
