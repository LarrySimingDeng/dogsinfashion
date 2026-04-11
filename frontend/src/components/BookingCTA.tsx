import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { motion } from 'framer-motion'
import { services } from '../data/services'
import { useAuth } from '../context/AuthContext'

interface Props {
  preselectedService: string
}

export default function BookingCTA({ preselectedService }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [serviceId, setServiceId] = useState('')

  useEffect(() => {
    if (preselectedService) setServiceId(preselectedService)
  }, [preselectedService])

  const handleBook = () => {
    const params = serviceId ? `?service=${serviceId}` : ''
    if (user) {
      navigate(`/book${params}`)
    } else {
      navigate('/login', { state: { from: { pathname: `/book${params}` } } })
    }
  }

  const inputClass =
    'w-full rounded-xl border-2 border-sky bg-cream px-4 py-3 font-body text-[0.95rem] text-warm-dark outline-none transition-colors focus:border-secondary'

  return (
    <section
      id="booking"
      className="bg-gradient-to-b from-background to-butter px-6 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[720px] rounded-3xl bg-white p-10 shadow-elevated md:p-12"
      >
        <div className="mb-8 text-center">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
            Book Your Appointment
          </p>
          <h2 className="mb-2 font-display text-3xl font-bold text-warm-dark">
            Schedule a Grooming Session
          </h2>
          <p className="text-warm-gray">
            Pick a service and book your appointment online — quick, easy, and
            confirmed instantly.
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold">Service</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={inputClass}
          >
            <option value="">— Choose a service —</option>
            {(['small', 'medium', 'large'] as const).map(size => {
              const sizeServices = services.filter(s => s.size === size)
              const first = sizeServices[0]!
              return (
                <optgroup key={size} label={`${first.label} (${first.weightRange})`}>
                  {sizeServices.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ${s.price}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </div>

        <button
          onClick={handleBook}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-secondary px-7 py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
        >
          <Calendar className="h-4.5 w-4.5" />
          {user ? 'Book Now' : 'Sign In to Book'}
        </button>

        <div className="mt-6 rounded-xl bg-blush/60 px-5 py-4 text-center text-sm text-warm-dark">
          Prefer to reach out directly? Call or text{' '}
          <a
            href="tel:+19162871878"
            className="font-bold text-secondary no-underline"
          >
            Doris at (916) 287-1878
          </a>{' '}
          or email{' '}
          <a
            href="mailto:contact@dogsinfashion.com"
            className="font-bold text-secondary no-underline"
          >
            contact@dogsinfashion.com
          </a>
        </div>
      </motion.div>
    </section>
  )
}
