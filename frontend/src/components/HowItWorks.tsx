import { ClipboardList, Calendar, CalendarCheck, Truck } from 'lucide-react'
import { motion } from 'framer-motion'

const steps = [
  {
    icon: ClipboardList,
    title: 'Pick a Service',
    desc: 'Choose from small, medium, large, or XL groom below.',
  },
  {
    icon: Calendar,
    title: 'Pick a Date & Time',
    desc: 'Select your preferred appointment slot.',
  },
  {
    icon: CalendarCheck,
    title: 'Add to Calendar',
    desc: "It gets added to both your and Doris's Google Calendar.",
  },
  {
    icon: Truck,
    title: 'We Show Up!',
    desc: 'Doris arrives at your door, ready to pamper your pup.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="bg-sky px-6 py-24">
      <div className="mx-auto mb-12 text-center">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
          How It Works
        </p>
        <h2 className="font-display text-4xl font-bold text-warm-dark">
          Easy as 1-2-3-4
        </h2>
      </div>

      <div className="relative mx-auto grid max-w-[900px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Connecting line (desktop) */}
        <div className="absolute left-[12.5%] right-[12.5%] top-[60px] hidden h-0.5 bg-sky-deep/30 lg:block" />

        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{ delay: i * 0.12, duration: 0.5 }}
            className="relative text-center"
          >
            <div className="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-white shadow-md">
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-white">
                {i + 1}
              </span>
              <step.icon className="h-6 w-6" />
            </div>
            <h4 className="mb-1.5 text-base font-bold text-warm-dark">
              {step.title}
            </h4>
            <p className="text-sm text-warm-gray">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
