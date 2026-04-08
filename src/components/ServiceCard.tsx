import { Check, Clock, Weight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ServiceTier } from '../data/services'

const accentBorderColors: Record<string, string> = {
  'sky-deep': 'bg-sky-deep',
  butter: 'bg-butter',
  peach: 'bg-peach',
  sage: 'bg-sage',
}

interface Props {
  service: ServiceTier
  index: number
  onBook: (id: string) => void
}

export default function ServiceCard({ service, index, onBook }: Props) {
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
        className={`h-1.5 ${accentBorderColors[service.accentColor] ?? 'bg-sky-deep'}`}
      />

      <div className="flex flex-1 flex-col px-6 pb-6 pt-7">
        {/* Weight badge */}
        <div className="mb-3 flex items-center gap-2">
          <Weight className="h-4 w-4 text-warm-gray" />
          <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-warm-gray">
            {service.weightRange}
          </span>
        </div>

        <h3 className="mb-1.5 font-display text-lg font-bold text-warm-dark">
          {service.name}
        </h3>

        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-secondary">
          <Clock className="h-3.5 w-3.5" />
          {service.duration} hours
        </div>

        <p className="mb-5 flex-1 text-sm leading-relaxed text-warm-gray">
          {service.description}
        </p>

        <div className="mb-4 font-display text-3xl font-bold text-secondary">
          ${service.price}
        </div>

        <ul className="mb-6 space-y-1.5">
          {service.features.map((f) => (
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
          onClick={() => onBook(service.id)}
          className="w-full rounded-full bg-secondary py-3 text-center text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
        >
          Book {service.label} Groom
        </button>
      </div>
    </motion.div>
  )
}
