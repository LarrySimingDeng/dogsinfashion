import { Phone, MessageCircle, Mail } from 'lucide-react'
import { motion } from 'framer-motion'
import dorisPhoto from '../assets/IMG_0908.JPG'
import MeshiDog from './MeshiDog'

const contacts = [
  { icon: Phone, label: '(916) 287-1878', href: 'tel:+19162871878' },
  { icon: MessageCircle, label: 'Text me to book', href: 'sms:+19162871878' },
  {
    icon: Mail,
    label: 'dogsinfashionca@gmail.com',
    href: 'mailto:dogsinfashionca@gmail.com',
  },
]

export default function About() {
  return (
    <section id="about" className="bg-white px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6 }}
        className="mx-auto grid max-w-[1000px] items-center gap-14 md:grid-cols-[1fr_1.2fr]"
      >
        {/* Photo */}
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-3xl shadow-elevated">
          <div className="aspect-[3/4] bg-gradient-to-br from-sky to-butter">
            <img
              src={dorisPhoto}
              alt="Doris — Owner and Lead Groomer at Dogs in Fashion"
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>

        {/* Info */}
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
            Meet Your Groomer
          </p>
          <div className="flex items-center gap-20">
            <h3 className="font-accent text-4xl text-warm-dark">
              Hi, I'm Doris!
            </h3>
            <MeshiDog />
          </div>
          <p className="mt-1 mb-5 text-base font-semibold text-secondary">
            Lead Groomer — Dogs in Fashion
          </p>
          <p className="mb-4 text-[0.98rem] leading-relaxed text-warm-gray">
            I'm a passionate pet lover and experienced groomer graduating from
            professional grooming academy, serving the Davis and Sacramento area.
            Every pup gets my undivided, gentle attention in a calm, one-on-one
            setting right at your home. I treat every dog like my own, because
            they deserve to look and feel their best.
          </p>
          <p className="mb-6 text-[0.98rem] leading-relaxed text-warm-gray">
            Whether your fur baby needs a refreshing bath or a full-style
            grooming session, I bring the salon to your doorstep with premium
            products and lots of love.
          </p>

          <div className="flex flex-col gap-3">
            {contacts.map((c) => (
              <a
                key={c.href}
                href={c.href}
                className="flex items-center gap-3 rounded-xl bg-sky/60 px-5 py-3 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky-deep/40"
              >
                <c.icon className="h-4.5 w-4.5 text-secondary" />
                {c.label}
              </a>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
