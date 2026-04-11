import { motion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'
import BeforeAfterSlider from './BeforeAfterSlider'
import before1 from '../assets/before1.JPG'
import after1 from '../assets/after1.JPG'
import before2 from '../assets/before2.JPG'
import after2 from '../assets/after2.JPG'

const makeovers = [
  {
    before: before1,
    after: after1,
    beforeAlt: 'Fluffy pup before her in-home grooming session',
    afterAlt: 'Same pup looking fresh and polished after a full groom',
    label: 'Makeover No. 01',
    caption: 'Scruffy to Chic',
    subcaption: 'Full Groom · Bath, Blow-dry & Trim',
  },
  {
    before: before2,
    after: after2,
    beforeAlt: 'Shaggy pup before her in-home grooming session',
    afterAlt: 'Same pup looking stunning after a full groom',
    label: 'Makeover No. 02',
    caption: 'Shaggy to Stunning',
    subcaption: 'Full Groom · Bath, Blow-dry & Style',
  },
]

export default function Results() {
  return (
    <section
      id="results"
      className="relative overflow-hidden bg-gradient-to-b from-sky via-peach/30 to-white px-6 py-28"
    >
      {/* Decorative ambient blobs */}
      <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-butter/60 blur-[90px]" />
      <div
        className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-blush/70 blur-[100px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 bottom-10 h-64 w-64 -translate-x-1/2 rounded-full bg-sage/30 blur-[90px]"
        aria-hidden="true"
      />

      {/* Subtle top divider waves */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1120px]">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto mb-16 max-w-[640px] text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-[0.7rem] font-bold uppercase tracking-[2px] text-secondary shadow-soft backdrop-blur-sm ring-1 ring-sky-deep/20">
            <Sparkles className="h-3.5 w-3.5" />
            Real Results
          </div>

          <h2 className="mb-4 text-balance font-display text-[2.75rem] font-bold leading-[1.05] text-warm-dark sm:text-5xl">
            The{' '}
            <span className="relative inline-block whitespace-nowrap">
              <span className="relative z-10">Glow&nbsp;Up</span>
              <motion.span
                initial={{ scaleX: 0, originX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.5,
                  duration: 0.7,
                  ease: [0.6, 0.05, 0.3, 0.95],
                }}
                className="absolute inset-x-0 bottom-[6px] z-0 block h-3 bg-butter sm:h-4"
                aria-hidden="true"
              />
            </span>
            {' '}
            <span className="inline-block align-middle" aria-hidden="true">
              ✨
            </span>
          </h2>

          <p className="mb-3 font-accent text-2xl leading-none text-primary">
            drag the slider — watch the magic
          </p>

          <p className="mx-auto max-w-[500px] text-pretty text-[1.02rem] leading-relaxed text-warm-gray">
            Every pup leaves Doris's care looking like the best version of
            themselves. Here's the proof — fresh from our most recent house
            calls.
          </p>
        </motion.div>

        {/* Sliders grid */}
        <div className="mx-auto grid max-w-[960px] gap-10 sm:grid-cols-2 sm:gap-8 md:gap-10">
          {makeovers.map((m, i) => (
            <BeforeAfterSlider key={i} {...m} index={i} />
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-20 text-center"
        >
          <a
            href="#booking"
            className="group inline-flex items-center gap-2.5 rounded-full bg-warm-dark px-8 py-4 text-sm font-bold text-white shadow-elevated transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:shadow-[0_20px_40px_-10px_rgba(232,151,94,0.55)]"
          >
            <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
            Book Your Pup's Glow Up
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <p className="mt-4 text-[0.7rem] font-bold uppercase tracking-[2px] text-warm-gray/70">
            In-home · Davis & Sacramento
          </p>
        </motion.div>
      </div>
    </section>
  )
}
