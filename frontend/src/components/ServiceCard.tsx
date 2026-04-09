import { Check, Clock, Weight, Sparkles, Droplets } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ServiceTier } from '../data/services'
import { formatDuration } from '../data/services'

const accentBorderColors: Record<string, string> = {
  'sky-deep': 'bg-sky-deep',
  butter: 'bg-butter',
  peach: 'bg-peach',
}

const accentTextColors: Record<string, string> = {
  'sky-deep': 'text-sky-deep',
  butter: 'text-butter',
  peach: 'text-peach',
}

interface Props {
  size: string
  weightRange: string
  accentColor: string
  bath: ServiceTier
  groom: ServiceTier
  index: number
  onBook: (id: string) => void
}

export default function SizeCard({
  size,
  weightRange,
  accentColor,
  bath,
  groom,
  index,
  onBook,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      whileHover={{ y: -6 }}
      className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-soft transition-shadow hover:shadow-elevated"
    >
      {/* Colored top bar */}
      <div
        className={`h-1.5 ${accentBorderColors[accentColor] ?? 'bg-sky-deep'}`}
      />

      <div className="flex flex-1 flex-col px-6 pb-6 pt-7">
        {/* Weight badge */}
        <div className="mb-3 flex items-center gap-2">
          <Weight className="h-4 w-4 text-warm-gray" />
          <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-warm-gray">
            {weightRange}
          </span>
        </div>

        <h3 className="mb-5 font-display text-2xl font-bold text-warm-dark">
          {size}
        </h3>

        {/* ── Bath section ── */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <Droplets
              className={`h-4 w-4 ${accentTextColors[accentColor] ?? 'text-sky-deep'}`}
            />
            <span className="text-sm font-bold text-warm-dark">Bath</span>
          </div>

          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-secondary">
              ${bath.price}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-secondary">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(bath.duration)}
            </span>
          </div>

          <ul className="mb-3 space-y-1.5">
            {bath.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-xs text-warm-gray"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage" />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => onBook(bath.id)}
            className="w-full rounded-full border-2 border-secondary bg-white py-2.5 text-center text-sm font-bold text-secondary transition-all hover:-translate-y-0.5 hover:bg-secondary hover:text-white"
          >
            Book Bath
          </button>
        </div>

        {/* ── Divider ── */}
        <div className="mb-5 border-t border-warm-gray/20" />

        {/* ── Full Groom section ── */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles
              className={`h-4 w-4 ${accentTextColors[accentColor] ?? 'text-sky-deep'}`}
            />
            <span className="text-sm font-bold text-warm-dark">
              Full Groom
            </span>
          </div>

          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-secondary">
              ${groom.price}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-secondary">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(groom.duration)}
            </span>
          </div>

          <ul className="mb-3 space-y-1.5">
            {groom.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-xs text-warm-gray"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage" />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => onBook(groom.id)}
            className="w-full rounded-full bg-secondary py-2.5 text-center text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            Book Full Groom
          </button>
        </div>
      </div>
    </motion.div>
  )
}
