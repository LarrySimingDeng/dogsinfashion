import { useState, useEffect, useMemo } from 'react'
import { Calendar, MessageCircle, Mail } from 'lucide-react'
import { motion } from 'framer-motion'
import { services, getServiceById } from '../data/services'
import { addToGoogleCalendar } from '../utils/calendar'
import { buildSmsLink, buildEmailLink } from '../utils/messaging'

interface Props {
  preselectedService: string
}

export default function BookingForm({ preselectedService }: Props) {
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [dogName, setDogName] = useState('')
  const [dogBreed, setDogBreed] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (preselectedService) setServiceId(preselectedService)
  }, [preselectedService])

  const today = useMemo(() => new Date().toISOString().split('T')[0]!, [])

  const data = { clientName, clientPhone, dogName, dogBreed, serviceId, date, time, address, notes }

  const selectedService = getServiceById(serviceId)

  const summaryText = useMemo(() => {
    if (!selectedService || !date || !time) return null
    const d = new Date(`${date}T${time}`)
    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    return `${selectedService.name} · ${selectedService.duration} hours · $${selectedService.price} — ${dateStr} at ${timeStr}`
  }, [selectedService, date, time])

  const handleCalendar = () => {
    if (!clientName || !dogName || !serviceId || !date || !time) {
      alert("Please fill in your name, dog's name, service, date, and time.")
      return
    }
    addToGoogleCalendar(data)
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
            Fill in the details below, then add it to Google Calendar so both
            you and Doris have it on the schedule.
          </p>
        </div>

        <form onSubmit={(e) => e.preventDefault()}>
          {/* Row 1 */}
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Your Name
              </label>
              <input
                type="text"
                placeholder="e.g. Jane Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Your Phone
              </label>
              <input
                type="tel"
                placeholder="e.g. (530) 555-1234"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Dog's Name
              </label>
              <input
                type="text"
                placeholder="e.g. Buddy"
                value={dogName}
                onChange={(e) => setDogName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Breed & Weight
              </label>
              <input
                type="text"
                placeholder="e.g. Golden Retriever, 65 lbs"
                value={dogBreed}
                onChange={(e) => setDogBreed(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Service */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-semibold">
              Service
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">— Choose a service —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.weightRange}) — ${s.price}
                </option>
              ))}
            </select>
          </div>

          {/* Date/Time */}
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Preferred Date
              </label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Preferred Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* Address */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-semibold">
              Your Address (where we'll come)
            </label>
            <input
              type="text"
              placeholder="e.g. 123 Oak Lane, Davis, CA 95616"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-semibold">
              Special Notes
            </label>
            <textarea
              rows={3}
              placeholder="Any allergies, behavioral notes, or requests..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Summary */}
          {summaryText && (
            <div className="mb-6 rounded-xl bg-sky/60 px-5 py-4 text-sm">
              <strong className="text-secondary">{summaryText}</strong>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCalendar}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-7 py-3.5 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              <Calendar className="h-4.5 w-4.5" />
              Add to Google Calendar
            </button>
            <a
              href={buildSmsLink(data)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sage-light px-7 py-3.5 font-bold text-warm-dark transition-colors hover:bg-sage"
            >
              <MessageCircle className="h-4.5 w-4.5" />
              Text Doris to Confirm
            </a>
            <a
              href={buildEmailLink(data)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blush px-7 py-3.5 font-bold text-warm-dark transition-colors hover:bg-blush/80"
            >
              <Mail className="h-4.5 w-4.5" />
              Email Doris Instead
            </a>
          </div>

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
              href="mailto:dorisliu0905@gmail.com"
              className="font-bold text-secondary no-underline"
            >
              dorisliu0905@gmail.com
            </a>
          </div>
        </form>
      </motion.div>
    </section>
  )
}
