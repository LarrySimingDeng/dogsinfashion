import { useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check, ArrowLeft, ArrowRight, Calendar, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { services, getServiceById, formatDuration } from '../data/services'

const sizes = ['small', 'medium', 'large'] as const
import SlotPicker from '../components/SlotPicker'
import {
  SquarePaymentForm,
  type SquarePaymentFormHandle,
} from '../components/SquarePaymentForm'
import { apiFetch } from '../lib/api'

const STEPS = ['Service', 'Date & Time', 'Details', 'Confirm']

// Feature flag: string compare on purpose — Boolean("false") === true.
const DEPOSIT_REQUIRED = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'
const DEPOSIT_AMOUNT_CENTS = Number(
  import.meta.env.VITE_DEPOSIT_AMOUNT_CENTS || '2000',
)
const DEPOSIT_AMOUNT_DISPLAY = `$${(DEPOSIT_AMOUNT_CENTS / 100).toFixed(0)}`

export default function BookingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [step, setStep] = useState(searchParams.get('service') ? 1 : 0)
  const [serviceId, setServiceId] = useState(searchParams.get('service') || '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [dogName, setDogName] = useState('')
  const [dogBreed, setDogBreed] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Square deposit state — only meaningful when DEPOSIT_REQUIRED=true.
  const squareFormRef = useRef<SquarePaymentFormHandle>(null)
  const [paymentReady, setPaymentReady] = useState(!DEPOSIT_REQUIRED)

  const selectedService = getServiceById(serviceId)

  const canNext = () => {
    if (step === 0) return !!serviceId
    if (step === 1) return !!date && !!time
    if (step === 2) return !!dogName && !!address
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (DEPOSIT_REQUIRED) {
        if (!squareFormRef.current) {
          throw new Error('Payment form is not ready yet')
        }
        // 1) Tokenize the card on the client — Square never touches our server
        //    until we hand them a single-use source_id.
        const sourceId = await squareFormRef.current.tokenize()
        // 2) Fresh idempotency key per attempt so retries don't double-charge.
        const idempotencyKey = crypto.randomUUID()
        await apiFetch('/api/bookings/with-deposit', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
            source_id: sourceId,
            idempotency_key: idempotencyKey,
          }),
        })
      } else {
        await apiFetch('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
          }),
        })
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    }
    setSubmitting(false)
  }

  const inputClass =
    'w-full rounded-xl border-2 border-sky bg-cream px-4 py-3 font-body text-[0.95rem] text-warm-dark outline-none transition-colors focus:border-secondary'

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky via-background to-butter px-6 pt-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-[520px] rounded-3xl bg-white p-10 text-center shadow-elevated"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-light">
            <Check className="h-8 w-8 text-sage" />
          </div>
          <h2 className="mb-2 font-display text-2xl font-bold text-warm-dark">
            Booking Confirmed!
          </h2>
          <p className="mb-6 text-warm-gray">
            Your {selectedService?.name} appointment on{' '}
            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}{' '}
            has been confirmed.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/my-bookings')}
              className="rounded-full bg-secondary px-7 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              View My Bookings
            </button>
            <button
              onClick={() => navigate('/')}
              className="rounded-full border-2 border-sky px-7 py-3 font-bold text-warm-dark transition-colors hover:bg-sky/30"
            >
              Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky via-background to-butter px-6 pb-20 pt-28">
      <div className="mx-auto max-w-[720px]">
        {/* Stepper */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  i < step
                    ? 'bg-sage text-white'
                    : i === step
                      ? 'bg-secondary text-white'
                      : 'bg-sky/40 text-warm-gray'
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 sm:w-12 ${i < step ? 'bg-sage' : 'bg-sky/40'}`} />
              )}
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-3xl bg-white p-8 shadow-elevated md:p-10"
        >
          {/* Step 0: Select Service */}
          {step === 0 && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
                Choose Your Service
              </h2>
              <div className="space-y-5">
                {sizes.map(size => {
                  const sizeServices = services.filter(s => s.size === size)
                  const first = sizeServices[0]!
                  return (
                    <div key={size}>
                      <h3 className="mb-2 text-sm font-bold text-warm-dark">
                        {first.label} — {first.weightRange}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {sizeServices.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setServiceId(s.id)}
                            className={`rounded-2xl border-2 p-5 text-left transition-all ${
                              serviceId === s.id
                                ? 'border-secondary bg-secondary/5 shadow-sm'
                                : 'border-sky hover:border-secondary/50'
                            }`}
                          >
                            <div className="mb-1 font-display text-lg font-bold text-warm-dark">
                              {s.type === 'bath' ? 'Bath' : 'Full Groom'}
                            </div>
                            <div className="mb-2 text-xs text-warm-gray">
                              {formatDuration(s.duration)}
                            </div>
                            <div className="font-display text-2xl font-bold text-secondary">
                              ${s.price}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 1: Date & Time */}
          {step === 1 && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
                Pick a Date & Time
              </h2>
              <SlotPicker
                serviceId={serviceId}
                selectedDate={date}
                selectedTime={time}
                onDateChange={setDate}
                onTimeChange={setTime}
              />
            </div>
          )}

          {/* Step 2: Dog Details */}
          {step === 2 && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
                Tell Us About Your Pup
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Dog's Name *</label>
                  <input
                    type="text"
                    value={dogName}
                    onChange={e => setDogName(e.target.value)}
                    placeholder="e.g. Buddy"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Breed & Weight</label>
                  <input
                    type="text"
                    value={dogBreed}
                    onChange={e => setDogBreed(e.target.value)}
                    placeholder="e.g. Golden Retriever, 65 lbs"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Your Address *</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. 123 Oak Lane, Davis, CA 95616"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Special Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Allergies, behavioral notes, or requests..."
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && selectedService && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
                Confirm Your Booking
              </h2>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-3 rounded-2xl bg-sky/20 p-6">
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Service</span>
                  <span className="font-semibold text-warm-dark">{selectedService.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Price</span>
                  <span className="font-semibold text-warm-dark">${selectedService.price}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Duration</span>
                  <span className="font-semibold text-warm-dark">{formatDuration(selectedService.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Date</span>
                  <span className="font-semibold text-warm-dark">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Time</span>
                  <span className="font-semibold text-warm-dark">{time}</span>
                </div>
                <hr className="border-sky" />
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Dog</span>
                  <span className="font-semibold text-warm-dark">
                    {dogName}{dogBreed ? ` (${dogBreed})` : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-warm-gray">Address</span>
                  <span className="text-right font-semibold text-warm-dark">{address}</span>
                </div>
                {notes && (
                  <div className="flex justify-between">
                    <span className="text-sm text-warm-gray">Notes</span>
                    <span className="text-right font-semibold text-warm-dark">{notes}</span>
                  </div>
                )}
              </div>

              {DEPOSIT_REQUIRED && (
                <div className="mt-6 rounded-2xl border-2 border-sky bg-cream p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-display text-lg font-bold text-warm-dark">
                      <Lock className="h-4 w-4 text-sage" />
                      Secure Deposit
                    </h3>
                    <span className="font-display text-xl font-bold text-secondary">
                      {DEPOSIT_AMOUNT_DISPLAY}
                    </span>
                  </div>
                  <p className="mb-4 text-xs leading-relaxed text-warm-gray">
                    A non-refundable {DEPOSIT_AMOUNT_DISPLAY} deposit holds your slot.
                    The remaining balance is due at your appointment. Card details
                    are handled securely by Square — we never see them.
                  </p>
                  <SquarePaymentForm
                    ref={squareFormRef}
                    onReady={() => setPaymentReady(true)}
                    onError={msg => setError(msg)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-sky px-5 py-2.5 text-sm font-bold text-warm-dark transition-colors hover:bg-sky/30"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || (DEPOSIT_REQUIRED && !paymentReady)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-7 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" />
                {submitting
                  ? DEPOSIT_REQUIRED
                    ? 'Processing payment…'
                    : 'Booking…'
                  : DEPOSIT_REQUIRED
                    ? `Pay ${DEPOSIT_AMOUNT_DISPLAY} & Confirm Booking`
                    : 'Confirm Booking'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
