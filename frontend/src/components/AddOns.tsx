import { motion } from 'framer-motion'
import { Gift, Plus } from 'lucide-react'
import { addOns } from '../data/services'

export default function AddOns() {
  return (
    <section className="bg-background px-6 py-20">
      <div className="mx-auto mb-10 max-w-[560px] text-center">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
          À la carte
        </p>
        <h2 className="mb-4 font-display text-3xl font-bold text-warm-dark sm:text-4xl">
          Extra Services & Add-ons
        </h2>
        <p className="text-[1.05rem] text-warm-gray">
          Mix and match extras onto any Bath or Full Groom. Ear cleaning is
          always on us — our little welcome gift.
        </p>
      </div>

      <div className="mx-auto mb-8 max-w-[1120px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sage/20 to-butter/30 px-5 py-4 shadow-soft"
        >
          <Gift className="h-6 w-6 flex-shrink-0 text-sage" />
          <div>
            <p className="text-sm font-bold text-warm-dark">
              Free ear cleaning — a gift with every service
            </p>
            <p className="text-xs text-warm-gray">
              Included with every Bath and Full Groom, no add-on required.
            </p>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((addOn, i) => (
            <motion.div
              key={addOn.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="flex flex-col rounded-xl border border-warm-gray/15 bg-white px-5 py-4 shadow-soft transition-shadow hover:shadow-elevated"
            >
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-secondary" />
                  <h3 className="text-sm font-bold text-warm-dark">
                    {addOn.name}
                  </h3>
                </div>
                <span className="whitespace-nowrap text-sm font-bold text-secondary">
                  {addOn.price}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-warm-gray">
                {addOn.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
