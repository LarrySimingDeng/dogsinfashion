import { Calendar, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { getServiceById, LEGACY_SERVICE_NAMES } from '../../data/services'

interface Booking {
  id: string
  service_id: string
  date: string
  start_time: string
  dog_name: string
  dog_breed: string | null
}

interface Props {
  bookings: Booking[]
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h! >= 12 ? 'PM' : 'AM'
  const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
  return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
}

export default function RecentCompleted({ bookings }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Recent Completed</h2>
      {bookings.length === 0 ? (
        <p className="py-8 text-center text-warm-gray">No completed bookings yet</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const service = getServiceById(b.service_id)
            return (
              <div key={b.id} className="flex items-center justify-between rounded-xl bg-sky/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-warm-dark">
                    {b.dog_name}{b.dog_breed ? ` (${b.dog_breed})` : ''}
                  </p>
                  <p className="text-xs text-warm-gray">
                    {service?.name || LEGACY_SERVICE_NAMES[b.service_id] || b.service_id}
                    {service ? ` · $${service.price}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-warm-gray">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(b.start_time)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
