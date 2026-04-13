import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  value: string            // yyyy-MM-dd or ''
  onChange: (date: string) => void
  className?: string
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const last = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= last; d++) {
    days.push(new Date(year, month, d))
  }
  return days
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function DatePicker({ value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Determine initial view month from value or today
  const initial = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = getDaysInMonth(viewYear, viewMonth)
  const firstDow = days[0]!.getDay()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-xl border-2 border-sky bg-cream px-3 py-2 text-left text-sm text-warm-dark outline-none transition-colors hover:border-sky-deep focus:border-secondary"
      >
        <Calendar className="h-4 w-4 shrink-0 text-secondary" />
        <span className={value ? 'font-medium' : 'text-warm-gray'}>
          {displayValue || 'Select date'}
        </span>
      </button>

      {/* Dropdown calendar */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-2xl border-2 border-sky bg-white p-4 shadow-elevated"
          >
            {/* Month navigation */}
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg p-1.5 text-warm-gray transition-colors hover:bg-sky/40 hover:text-warm-dark"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-display text-sm font-bold text-warm-dark">
                {new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg p-1.5 text-warm-gray transition-colors hover:bg-sky/40 hover:text-warm-dark"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-warm-gray">
              {WEEKDAY_LABELS.map(d => <div key={d} className="py-1">{d}</div>)}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map(day => {
                const dateStr = formatDate(day)
                const isToday = dateStr === formatDate(today)
                const isSelected = dateStr === value

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => { onChange(dateStr); setOpen(false) }}
                    className={`relative rounded-lg py-1.5 text-sm transition-all ${
                      isSelected
                        ? 'bg-secondary font-bold text-white shadow-glow'
                        : isToday
                          ? 'font-bold text-secondary hover:bg-sky/40'
                          : 'font-medium text-warm-dark hover:bg-sky/30'
                    }`}
                  >
                    {day.getDate()}
                    {isToday && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-secondary" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Today shortcut */}
            <div className="mt-3 border-t border-sky pt-2 text-center">
              <button
                type="button"
                onClick={() => { onChange(formatDate(today)); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setOpen(false) }}
                className="text-xs font-semibold text-secondary transition-colors hover:text-warm-dark"
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
