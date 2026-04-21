import { services } from '../data/services'
import SizeCard from './ServiceCard'

interface Props {
  onBookService: (id: string) => void
}

const sizes = ['small', 'medium', 'large'] as const

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
          Go Essential with our Bath, or step up to the Luxury Full Groom.
          Every service ships with a free ear cleaning gift.
        </p>
      </div>

      <div className="mx-auto grid max-w-[1120px] gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sizes.map((size, i) => {
          const bath = services.find(
            (s) => s.size === size && s.type === 'bath',
          )!
          const groom = services.find(
            (s) => s.size === size && s.type === 'groom',
          )!
          return (
            <SizeCard
              key={size}
              size={bath.label}
              weightRange={bath.weightRange}
              accentColor={bath.accentColor}
              bath={bath}
              groom={groom}
              index={i}
              onBook={onBookService}
            />
          )
        })}
      </div>
    </section>
  )
}
