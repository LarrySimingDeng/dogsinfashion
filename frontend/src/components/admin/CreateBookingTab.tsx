import { useEffect, useRef, useState } from 'react'
import { Search, X, Mail, MapPin, Phone, User } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { maskPhoneInput, normalizePhoneToDisplay, isValidDisplayPhone } from '../../lib/phone'
import { services } from '../../data/services'
import SlotPicker from '../SlotPicker'
import Toast, { ToastData } from '../Toast'

interface AdminUser {
  id: string
  email: string
  name: string | null
  default_address: string | null
  latest_phone: string | null
}

const inputClass =
  'w-full rounded-xl border-2 border-sky bg-white px-4 py-3 text-[0.95rem] text-warm-dark placeholder:text-warm-gray/60 focus:border-secondary focus:outline-none'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || !local) return email
  const visible = local.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}

function lastFourPhone(phone: string | null): string {
  if (!phone) return '(no phone)'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '(short)'
  return `***-${digits.slice(-4)}`
}

export default function CreateBookingTab() {
  // Customer search
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<AdminUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [pending, setPending] = useState<AdminUser | null>(null)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const debounceRef = useRef<number | null>(null)

  // Form
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [dogName, setDogName] = useState('')
  const [dogBreed, setDogBreed] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [toasts, setToasts] = useState<ToastData[]>([])
  const pushToast = (message: string, type: ToastData['type'] = 'info') => {
    setToasts(t => [...t, { id: Date.now() + Math.random(), message, type }])
  }
  const dismiss = (id: number) => setToasts(t => t.filter(x => x.id !== id))

  useEffect(() => {
    if (selected) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
        const data = await apiFetch<{ users: AdminUser[] }>(`/api/admin/users${qs}`)
        setResults(data.users)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Search failed', 'error')
        setResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [search, selected])

  function selectCustomer(u: AdminUser) {
    setSelected(u)
    setPending(null)
    setShowResults(false)
    const prefilled = normalizePhoneToDisplay(u.latest_phone)
    setPhone(prefilled ?? '')
    setAddress(u.default_address ?? '')
  }

  function changeCustomer() {
    setSelected(null)
    setSearch('')
    setResults([])
    setServiceId('')
    setDate('')
    setTime('')
    setDogName('')
    setDogBreed('')
    setPhone('')
    setAddress('')
    setNotes('')
  }

  async function submit() {
    if (!selected) return
    if (!serviceId) return pushToast('Pick a service', 'error')
    if (!date || !time) return pushToast('Pick a date and time', 'error')
    if (!dogName.trim()) return pushToast('Enter the dog name', 'error')
    if (!isValidDisplayPhone(phone)) return pushToast('Enter a valid phone number', 'error')
    if (!address.trim()) return pushToast('Enter an address', 'error')

    setSubmitting(true)
    try {
      await apiFetch('/api/bookings/admin', {
        method: 'POST',
        body: JSON.stringify({
          target_user_id: selected.id,
          service_id: serviceId,
          date,
          start_time: time,
          dog_name: dogName.trim(),
          dog_breed: dogBreed.trim() || undefined,
          phone: `+1 ${phone}`,
          address: address.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      pushToast(`Booking created for ${selected.name ?? selected.email}`, 'success')
      changeCustomer()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create booking', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-elevated">
      <Toast toasts={toasts} onDismiss={dismiss} />

      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">
        Create Booking on Behalf of Customer (帮用户预约)
      </h2>

      {!selected ? (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-warm-dark">
            Search customer by name or email (搜索用户姓名或邮箱，仅支持注册过的老用户)
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-gray" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setShowResults(true)}
              placeholder="Type to search..."
              className={`${inputClass} pl-10`}
            />
          </div>

          {showResults && (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border-2 border-sky bg-white">
              {searchLoading ? (
                <div className="p-4 text-center text-sm text-warm-gray">Searching...</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-sm text-warm-gray">No customers found</div>
              ) : (
                results.map(u => (
                  <button
                    key={u.id}
                    onClick={() => setPending(u)}
                    className="flex w-full items-center justify-between gap-3 border-b border-sky/40 px-4 py-3 text-left last:border-b-0 hover:bg-sky/20"
                  >
                    <div>
                      <div className="text-sm font-semibold text-warm-dark">
                        {u.name ?? '(no name)'}
                      </div>
                      <div className="text-xs text-warm-gray">{u.email}</div>
                    </div>
                    <div className="shrink-0 text-xs text-warm-gray">
                      {lastFourPhone(u.latest_phone)}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected customer card */}
          <div className="rounded-2xl border-2 border-sky bg-sky/10 p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-secondary" />
                <span className="font-display text-lg font-bold text-warm-dark">
                  {selected.name ?? '(no name)'}
                </span>
              </div>
              <button
                onClick={changeCustomer}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-warm-gray hover:bg-white"
              >
                <X className="h-3 w-3" /> Change customer
              </button>
            </div>
            <dl className="space-y-1 text-sm text-warm-dark">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-warm-gray" />
                <span>{selected.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-warm-gray" />
                <span>Latest booking phone: {selected.latest_phone ?? '(none)'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-warm-gray" />
                <span>Default address: {selected.default_address ?? '(none)'}</span>
              </div>
            </dl>
          </div>

          {/* Service */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Service *</label>
            <select
              value={serviceId}
              onChange={e => { setServiceId(e.target.value); setTime('') }}
              className={inputClass}
            >
              <option value="">Pick a service...</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — ${s.price}
                </option>
              ))}
            </select>
          </div>

          {/* Date & time */}
          {serviceId && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Date & time *</label>
              <SlotPicker
                serviceId={serviceId}
                selectedDate={date}
                selectedTime={time}
                onDateChange={d => { setDate(d); setTime('') }}
                onTimeChange={setTime}
              />
            </div>
          )}

          {/* Dog */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Dog name *</label>
              <input
                type="text"
                value={dogName}
                onChange={e => setDogName(e.target.value)}
                placeholder="e.g. Meshi"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Breed / weight</label>
              <input
                type="text"
                value={dogBreed}
                onChange={e => setDogBreed(e.target.value)}
                placeholder="e.g. Golden Retriever, 65 lbs"
                className={inputClass}
              />
            </div>
          </div>

          {/* Phone & address */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Phone *</label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-xl border-2 border-sky bg-sky/20 px-3 py-3 text-[0.95rem] font-semibold text-warm-gray">+1</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(maskPhoneInput(e.target.value))}
                  placeholder="(916) 287-1878"
                  className={inputClass}
                />
              </div>
              <p className="mt-1.5 text-xs text-warm-gray">📱 We'll send the 24h/2h SMS reminder to this number.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Address *</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. 123 Oak Lane, Davis, CA 95616"
                className={inputClass}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-warm-dark">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional — anything Doris should know"
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              onClick={changeCustomer}
              className="rounded-xl border-2 border-sky px-5 py-2.5 text-sm font-semibold text-warm-dark hover:bg-sky/20"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-semibold text-white hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Booking →'}
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-dark/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-elevated">
            <h3 className="mb-3 font-display text-lg font-bold text-warm-dark">Confirm customer</h3>
            <p className="mb-5 text-sm text-warm-dark">
              Create a booking for{' '}
              <span className="font-semibold">{pending.name ?? '(no name)'}</span>
              {' '}({maskEmail(pending.email)}, latest phone {lastFourPhone(pending.latest_phone)})?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="rounded-xl border-2 border-sky px-4 py-2 text-sm font-semibold text-warm-dark hover:bg-sky/20"
              >
                Cancel
              </button>
              <button
                onClick={() => selectCustomer(pending)}
                className="rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary/90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
