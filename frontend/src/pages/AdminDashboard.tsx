import { useState, useEffect, useCallback } from 'react'
import { Calendar, Clock, Settings, Filter, Bell, BarChart3, Dog, MapPin, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { apiFetch } from '../lib/api'
import { getServiceById, LEGACY_SERVICE_NAMES } from '../data/services'
import AnalyticsTab from '../components/analytics/AnalyticsTab'
import DogLoader from '../components/DogLoader'
import RescheduleModal from '../components/RescheduleModal'
import Toast, { ToastData } from '../components/Toast'

interface Booking {
  id: string
  user_id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  dog_breed: string | null
  address: string
  notes: string | null
  status: 'confirmed' | 'completed' | 'cancelled'
  created_at: string
}

interface AvailabilityRow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

interface BlockedDate {
  id: string
  date: string
  reason: string | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AdminDashboard() {
  const [tab, setTab] = useState<'analytics' | 'bookings' | 'schedule' | 'reminders'>('bookings')

  return (
    <div className="min-h-screen bg-background px-6 pb-20 pt-28">
      <div className="mx-auto max-w-[960px]">
        <h1 className="mb-6 font-display text-3xl font-bold text-warm-dark">Admin Dashboard</h1>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setTab('bookings')}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
              tab === 'bookings'
                ? 'bg-secondary text-white'
                : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
            }`}
          >
            <Calendar className="h-4 w-4" /> Bookings
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
              tab === 'schedule'
                ? 'bg-secondary text-white'
                : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
            }`}
          >
            <Settings className="h-4 w-4" /> Schedule
          </button>
          <button
            onClick={() => setTab('reminders')}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
              tab === 'reminders'
                ? 'bg-secondary text-white'
                : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
            }`}
          >
            <Bell className="h-4 w-4" /> Reminders
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
              tab === 'analytics'
                ? 'bg-secondary text-white'
                : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
            }`}
          >
            <BarChart3 className="h-4 w-4" /> Analytics
          </button>
        </div>

        {tab === 'analytics' ? <AnalyticsTab /> : tab === 'bookings' ? <BookingsTab /> : tab === 'schedule' ? <ScheduleTab /> : <RemindersTab />}
      </div>
    </div>
  )
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [filterLoading, setFilterLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<ToastData[]>([])
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const showToast = (message: string, type: ToastData['type'] = 'success') =>
    setToasts(prev => prev.some(t => t.message === message) ? prev : [...prev, { id: Date.now(), message, type }])

  useEffect(() => {
    if (initialLoading) {
      // first load — handled by initialLoading
    } else {
      setFilterLoading(true)
    }
    const params = statusFilter ? `?status=${statusFilter}` : ''
    apiFetch<Booking[]>(`/api/bookings${params}`)
      .then(data => setBookings(data.sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time))))
      .catch((err) => console.error('Failed to fetch bookings:', err))
      .finally(() => { setInitialLoading(false); setFilterLoading(false) })
  }, [statusFilter])

  const updateStatus = async (id: string, status: 'completed' | 'cancelled') => {
    if (updatingIds.has(id)) return
    setUpdatingIds(prev => new Set(prev).add(id))
    try {
      await apiFetch(`/api/bookings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
      showToast(`Booking ${status === 'completed' ? 'marked as completed' : 'cancelled'} successfully!`)
    } catch {
      showToast('Failed to update status', 'error')
    } finally {
      setUpdatingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h! >= 12 ? 'PM' : 'AM'
    const dh = h! === 0 ? 12 : h! > 12 ? h! - 12 : h!
    return `${dh}:${String(m!).padStart(2, '0')} ${ampm}`
  }

  const statusColors: Record<string, string> = {
    confirmed: 'bg-secondary/10 text-secondary',
    completed: 'bg-sage-light text-sage',
    cancelled: 'bg-red-50 text-red-500',
  }

  if (initialLoading) {
    return <div className="flex justify-center py-32"><DogLoader /></div>
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-warm-gray" />
        {['', 'confirmed', 'completed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-secondary text-white'
                : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {filterLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" /></div>
      ) : bookings.length === 0 ? (
        <p className="py-8 text-center text-warm-gray">No bookings found.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => {
            const service = getServiceById(b.service_id)
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="overflow-hidden rounded-3xl bg-white shadow-soft transition-shadow hover:shadow-elevated"
              >
                <div className="h-1.5 bg-gradient-to-r from-secondary via-sky-deep to-sky" />

                <div className="p-5">
                  {/* Header: service name + price */}
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-warm-dark">
                      {service?.name || LEGACY_SERVICE_NAMES[b.service_id] || b.service_id}
                    </h3>
                    {service && (
                      <span className="font-display text-2xl font-bold text-primary/70">
                        ${service.price}
                      </span>
                    )}
                  </div>

                  {/* Two-column: details left, badge + actions right */}
                  <div className="flex gap-5">
                    <div className="flex-1 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 shrink-0 text-primary/70" />
                        <span className="font-semibold text-warm-dark">Date</span>
                        <span className="text-warm-gray">{new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-primary/70" />
                        <span className="font-semibold text-warm-dark">Time</span>
                        <span className="text-warm-gray">{formatTime(b.start_time)} — {formatTime(b.end_time)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dog className="h-4 w-4 shrink-0 text-primary/70" />
                        <span className="font-semibold text-warm-dark">Dog Name</span>
                        <span className="text-warm-gray">{b.dog_name}{b.dog_breed ? ` (${b.dog_breed})` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
                        <span className="font-semibold text-warm-dark">Address</span>
                        <span className="text-warm-gray">{b.address}</span>
                      </div>
                      {b.notes && (
                        <p className="mt-1 text-xs italic text-warm-gray">Note: {b.notes}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end justify-between">
                      <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${statusColors[b.status]}`}>
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                      {b.status === 'confirmed' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setRescheduleBooking(b)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reschedule
                          </button>
                          <button
                            onClick={() => updateStatus(b.id, 'completed')}
                            disabled={updatingIds.has(b.id)}
                            className="rounded-full bg-sage-light px-3 py-1.5 text-xs font-bold text-sage transition-colors hover:bg-sage hover:text-white disabled:opacity-50"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => updateStatus(b.id, 'cancelled')}
                            disabled={updatingIds.has(b.id)}
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {rescheduleBooking && (
        <RescheduleModal
          booking={rescheduleBooking}
          onClose={() => setRescheduleBooking(null)}
          onRescheduled={(updated) => {
            setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
            setRescheduleBooking(null)
            showToast('Booking rescheduled successfully!')
          }}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function ScheduleTab() {
  const [availability, setAvailability] = useState<AvailabilityRow[]>([])
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newBlockedDate, setNewBlockedDate] = useState('')
  const [newBlockedReason, setNewBlockedReason] = useState('')

  useEffect(() => {
    apiFetch<{ availability: AvailabilityRow[]; blockedDates: BlockedDate[] }>('/api/availability/schedule')
      .then(data => {
        setAvailability(data.availability)
        setBlockedDates(data.blockedDates)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const updateRow = (id: string, field: keyof AvailabilityRow, value: string | boolean) => {
    setAvailability(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const saveSchedule = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/availability/schedule', {
        method: 'PUT',
        body: JSON.stringify(availability),
      })
    } catch {
      alert('Failed to save schedule')
    }
    setSaving(false)
  }

  const addBlockedDate = async () => {
    if (!newBlockedDate) return
    try {
      const data = await apiFetch<BlockedDate>('/api/availability/blocked-dates', {
        method: 'POST',
        body: JSON.stringify({ date: newBlockedDate, reason: newBlockedReason || undefined }),
      })
      setBlockedDates(prev => [...prev, data])
      setNewBlockedDate('')
      setNewBlockedReason('')
    } catch {
      alert('Failed to add blocked date')
    }
  }

  const removeBlockedDate = async (id: string) => {
    try {
      await apiFetch(`/api/availability/blocked-dates/${id}`, { method: 'DELETE' })
      setBlockedDates(prev => prev.filter(d => d.id !== id))
    } catch {
      alert('Failed to remove blocked date')
    }
  }

  const inputClass =
    'rounded-xl border-2 border-sky bg-cream px-3 py-2 text-sm text-warm-dark outline-none transition-colors focus:border-secondary'

  if (loading) {
    return <div className="flex justify-center py-32"><DogLoader /></div>
  }

  return (
    <div className="space-y-8">
      {/* Weekly Schedule */}
      <div className="rounded-2xl border-2 border-sky bg-white p-6">
        <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Weekly Hours</h2>
        <div className="space-y-3">
          {availability.map(row => (
            <div key={row.id} className="flex items-center gap-3">
              <label className="flex w-24 shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  onChange={e => updateRow(row.id, 'is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-sky text-secondary"
                />
                <span className={`text-sm font-semibold ${row.is_active ? 'text-warm-dark' : 'text-warm-gray line-through'}`}>
                  {DAYS[row.day_of_week]}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={row.start_time}
                  onChange={e => updateRow(row.id, 'start_time', e.target.value)}
                  disabled={!row.is_active}
                  className={`${inputClass} w-[6.5rem] disabled:opacity-40`}
                />
                <span className="text-warm-gray">–</span>
                <input
                  type="time"
                  value={row.end_time}
                  onChange={e => updateRow(row.id, 'end_time', e.target.value)}
                  disabled={!row.is_active}
                  className={`${inputClass} w-[6.5rem] disabled:opacity-40`}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={saveSchedule}
          disabled={saving}
          className="mt-4 rounded-full bg-secondary px-6 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>

      {/* Blocked Dates */}
      <div className="rounded-2xl border-2 border-sky bg-white p-6">
        <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Blocked Dates (Days Off)</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Date</label>
            <input
              type="date"
              value={newBlockedDate}
              onChange={e => setNewBlockedDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Reason (optional)</label>
            <input
              type="text"
              value={newBlockedReason}
              onChange={e => setNewBlockedReason(e.target.value)}
              placeholder="e.g. Vacation"
              className={inputClass}
            />
          </div>
          <button
            onClick={addBlockedDate}
            className="rounded-full bg-secondary px-5 py-2 text-sm font-bold text-white transition-all hover:shadow-glow"
          >
            Add
          </button>
        </div>

        {blockedDates.length === 0 ? (
          <p className="text-sm text-warm-gray">No blocked dates.</p>
        ) : (
          <div className="space-y-2">
            {blockedDates.map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-xl bg-sky/20 px-4 py-2">
                <span className="text-sm">
                  <strong>{new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                  {d.reason && <span className="ml-2 text-warm-gray">— {d.reason}</span>}
                </span>
                <button
                  onClick={() => removeBlockedDate(d.id)}
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ReminderSettings {
  email_enabled: boolean
  email_hours_before: number
  sms_enabled: boolean
  sms_hours_before: number
}

function RemindersTab() {
  const [settings, setSettings] = useState<ReminderSettings>({
    email_enabled: true,
    email_hours_before: 24,
    sms_enabled: true,
    sms_hours_before: 2,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetch<ReminderSettings>('/api/reminders/settings')
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const data = await apiFetch<ReminderSettings>('/api/reminders/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      alert('Failed to save reminder settings')
    }
    setSaving(false)
  }

  const inputClass =
    'rounded-xl border-2 border-sky bg-cream px-3 py-2 text-sm text-warm-dark outline-none transition-colors focus:border-secondary w-20'

  if (loading) {
    return <div className="flex justify-center py-32"><DogLoader /></div>
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-sky bg-white p-6">
        <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Reminder Settings</h2>
        <p className="mb-6 text-sm text-warm-gray">
          Configure automatic reminders sent to clients before their appointments.
        </p>

        <div className="space-y-5">
          {/* Email Reminder */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-sky/10 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.email_enabled}
                onChange={e => setSettings(s => ({ ...s, email_enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-sky text-secondary"
              />
              <span className="font-semibold text-warm-dark">Email Reminder</span>
            </label>
            <div className="flex items-center gap-2 text-sm text-warm-gray">
              <input
                type="number"
                min={1}
                max={168}
                value={settings.email_hours_before}
                onChange={e => setSettings(s => ({ ...s, email_hours_before: Number(e.target.value) }))}
                disabled={!settings.email_enabled}
                className={`${inputClass} disabled:opacity-40`}
              />
              <span>hours before appointment</span>
            </div>
          </div>

          {/* SMS Reminder */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-sky/10 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.sms_enabled}
                onChange={e => setSettings(s => ({ ...s, sms_enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-sky text-secondary"
              />
              <span className="font-semibold text-warm-dark">SMS Reminder</span>
            </label>
            <div className="flex items-center gap-2 text-sm text-warm-gray">
              <input
                type="number"
                min={1}
                max={168}
                value={settings.sms_hours_before}
                onChange={e => setSettings(s => ({ ...s, sms_hours_before: Number(e.target.value) }))}
                disabled={!settings.sms_enabled}
                className={`${inputClass} disabled:opacity-40`}
              />
              <span>hours before appointment</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-secondary px-6 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-sm font-semibold text-sage">Saved!</span>}
        </div>
      </div>
    </div>
  )
}
