import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PetAvatar from './PetAvatar'
import type { Pet } from '../types/pet'

interface Props {
  pet: Pet
  index?: number
}

const sizeLabels: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

export default function PetCard({ pet, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        to={`/my-pets/${pet.id}`}
        className="group block overflow-hidden rounded-3xl bg-white shadow-soft no-underline transition-shadow hover:shadow-elevated"
      >
        {/* Thin gradient accent bar — matches BookingCard */}
        <div className="h-1.5 bg-gradient-to-r from-secondary via-sky-deep to-sky" />

        <div className="flex items-center gap-4 p-5">
          <PetAvatar photoUrl={pet.photo_url} name={pet.name} size="lg" />

          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-xl font-bold text-warm-dark group-hover:text-secondary">
              {pet.name}
            </h3>
            {pet.breed && (
              <p className="truncate text-sm text-warm-gray">{pet.breed}</p>
            )}
            {pet.size && (
              <span className="mt-1.5 inline-block rounded-full bg-sky/40 px-3 py-0.5 text-xs font-semibold text-secondary">
                {sizeLabels[pet.size]}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
