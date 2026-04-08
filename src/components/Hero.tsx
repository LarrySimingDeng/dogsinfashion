import { Truck, Heart, Sparkles, Star, Droplets } from 'lucide-react'
import { motion } from 'framer-motion'

const badges = [
  { icon: Truck, text: 'We Come to You' },
  { icon: Heart, text: '1-on-1 Care' },
  { icon: Sparkles, text: 'Stress-Free' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

export default function Hero() {
  return (
    <section className="grain relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky via-background to-butter px-6 pb-20 pt-32">
      {/* Decorative blobs */}
      <div className="absolute -right-32 -top-32 h-[450px] w-[450px] rounded-full bg-gradient-radial from-peach/50 to-transparent" />
      <div className="absolute -bottom-20 -left-20 h-[350px] w-[350px] rounded-full bg-gradient-radial from-sky/60 to-transparent" />
      <div className="absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-gradient-radial from-blush/30 to-transparent" />

      <div className="relative z-10 mx-auto grid max-w-[1100px] items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Text */}
        <div className="text-center md:text-left">
          <motion.div
            className="mb-6 flex flex-wrap justify-center gap-3 md:justify-start"
            initial="hidden"
            animate="visible"
          >
            {badges.map((b, i) => (
              <motion.span
                key={b.text}
                custom={i}
                variants={fadeUp}
                className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-sky-deep bg-white px-4 py-1.5 text-[0.82rem] font-semibold text-secondary"
              >
                <b.icon className="h-3.5 w-3.5" />
                {b.text}
              </motion.span>
            ))}
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mb-5 font-display text-4xl font-bold leading-[1.15] text-warm-dark md:text-5xl lg:text-[3.4rem]"
          >
            Pamper Your Pup
            <br />
            <em className="text-secondary">in Style</em>
            <br />
            Right at Your Door
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mx-auto mb-8 max-w-[460px] text-[1.1rem] text-warm-gray md:mx-0"
          >
            Professional mobile grooming in Davis, Sacramento, Woodland &
            surrounding areas. Your fur baby deserves a spa day — no car ride
            needed.
          </motion.p>

          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap justify-center gap-3.5 md:justify-start"
          >
            <a
              href="#booking"
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-7 py-3.5 text-[0.95rem] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              Book Appointment
            </a>
            <a
              href="sms:+19162871878"
              className="inline-flex items-center gap-2 rounded-full border-2 border-sky-deep bg-white px-7 py-3.5 text-[0.95rem] font-bold text-secondary transition-colors hover:bg-sky"
            >
              Text Doris
            </a>
          </motion.div>
        </div>

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative mx-auto flex items-center justify-center md:mx-0"
        >
          <div className="relative w-full max-w-[440px] overflow-hidden rounded-4xl shadow-elevated">
            <img
              src="/happydogs.png"
              alt="Happy dogs groomed by Dogs in Fashion"
              className="h-[480px] w-full object-cover object-center"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-warm-dark/70 to-transparent p-6 pb-7 text-white">
              <h3 className="font-display text-xl font-bold">
                Dogs in Fashion
              </h3>
              <p className="text-sm opacity-90">
                Mobile grooming — gentle, professional, and at your doorstep.
              </p>
            </div>
          </div>

          {/* Floating badges */}
          <div className="absolute -right-5 -top-2.5 hidden animate-float items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft md:flex">
            <Star className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-warm-dark">
              5-Star Service
            </span>
          </div>
          <div className="absolute -bottom-2.5 -left-5 hidden animate-float-delayed items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft md:flex">
            <Droplets className="h-4 w-4 text-secondary" />
            <span className="text-sm font-semibold text-warm-dark">
              Premium Products
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
