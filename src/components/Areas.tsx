import { Home, TreePine, Building2, Wheat, Navigation } from 'lucide-react'
import { motion } from 'framer-motion'

const areas = [
  { icon: Home, label: 'Davis' },
  { icon: Building2, label: 'Sacramento' },
  { icon: TreePine, label: 'Woodland' },
  { icon: Home, label: 'El Macero' },
  { icon: Wheat, label: 'Mace Ranch' },
  { icon: Home, label: 'West Sacramento' },
  { icon: Navigation, label: 'Nearby Areas' },
]

export default function Areas() {
  return (
    <section id="areas" className="bg-white px-6 py-24">
      <div className="mx-auto mb-12 max-w-[560px] text-center">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
          Service Areas
        </p>
        <h2 className="mb-4 font-display text-4xl font-bold text-warm-dark">
          We Come to You!
        </h2>
        <p className="text-[1.05rem] text-warm-gray">
          Dogs in Fashion proudly serves the greater Davis and Sacramento area.
          Not sure if we cover your neighborhood? Just text Doris!
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-[800px]"
      >
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {areas.map((a, i) => (
            <motion.span
              key={a.label}
              whileHover={{ scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="inline-flex items-center gap-2 rounded-full bg-sky px-5 py-2.5 text-[0.92rem] font-semibold text-secondary transition-colors hover:bg-sky-deep"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </motion.span>
          ))}
        </div>

        <p className="text-center text-[0.92rem] text-warm-gray">
          Don't see your city?{' '}
          <a
            href="sms:+19162871878"
            className="font-bold text-secondary no-underline hover:underline"
          >
            Text Doris
          </a>{' '}
          to ask — we're always expanding!
        </p>
      </motion.div>
    </section>
  )
}
