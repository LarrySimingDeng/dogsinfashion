import { services } from '../data/services'
import ServiceCard from './ServiceCard'

interface Props {
  onBookService: (id: string) => void
}

export default function Services({ onBookService }: Props) {
  return (
    <section
      id="services"
      className="bg-gradient-to-b from-background to-sky px-6 py-24"
    >
      <div className="mx-auto mb-12 max-w-[560px] text-center">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
          Services & Pricing
        </p>
        <h2 className="mb-4 font-display text-4xl font-bold text-warm-dark">
          Choose Your Pup's Pampering
        </h2>
        <p className="text-[1.05rem] text-warm-gray">
          Every session is a full groom: one-on-one, gentle, and tailored to
          your pet's size and needs.
        </p>
      </div>

      <div className="mx-auto grid max-w-[1120px] gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {services.map((s, i) => (
          <ServiceCard
            key={s.id}
            service={s}
            index={i}
            onBook={onBookService}
          />
        ))}
      </div>
    </section>
  )
}
