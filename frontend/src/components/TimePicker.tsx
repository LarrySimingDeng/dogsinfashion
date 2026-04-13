import { useState, useRef, useEffect } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  value: string            // HH:mm (24h) or ''
  onChange: (time: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Interval in minutes between time options (default: 30) */
  interval?: number
}

function formatDisplay(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const displayH = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${displayH}:${String(m!).padStart(2, '0')} ${ampm}`
}

function generateTimeOptions(interval: number): string[] {
  const options: string[] = []
  for (let mins = 0; mins < 24 * 60; mins += interval) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return options
}

export default function TimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select time',
  className = '',
  interval = 30,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const options = generateTimeOptions(interval)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Scroll selected option into view when opening
  useEffect(() => {
    if (!open || !listRef.current || !value) return
    const idx = options.indexOf(value)
    if (idx < 0) return
    // Each option is ~36px tall; center in the 224px dropdown
    const scrollTo = idx * 36 - 94
    listRef.current.scrollTop = Math.max(0, scrollTo)
  }, [open, value, options])

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        disabled={disabled}
        className={`flex w-[8.5rem] items-center gap-2 rounded-xl border-2 border-sky bg-cream px-3 py-2 text-left text-sm outline-none transition-colors ${
          disabled
            ? 'opacity-40'
            : 'hover:border-sky-deep focus:border-secondary'
        } ${value ? 'font-medium text-warm-dark' : 'text-warm-gray'}`}
      >
        <Clock className="h-4 w-4 shrink-0 text-secondary" />
        <span className="flex-1">{value ? formatDisplay(value) : placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-warm-gray transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-2 w-[8.5rem] rounded-xl border-2 border-sky bg-white shadow-elevated"
          >
            <div ref={listRef} className="max-h-56 overflow-y-auto overscroll-contain py-1">
              {options.map(opt => {
                const isSelected = opt === value
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { onChange(opt); setOpen(false) }}
                    className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? 'bg-secondary/10 font-bold text-secondary'
                        : 'text-warm-dark hover:bg-sky/30'
                    }`}
                  >
                    {formatDisplay(opt)}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
