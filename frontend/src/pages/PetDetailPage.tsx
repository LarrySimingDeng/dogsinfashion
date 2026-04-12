import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Pencil, Trash2, Save } from 'lucide-react'
import { motion } from 'framer-motion'
import DogLoader from '../components/DogLoader'
import PetAvatar from '../components/PetAvatar'
import PetFormModal from '../components/PetFormModal'
import Toast, { ToastData } from '../components/Toast'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { getServiceById, LEGACY_SERVICE_NAMES } from '../data/services'
import type { Pet, PetWithHistory, PetBookingHistoryItem } from '../types/pet'

const sizeLabels: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

function computeAge(birthday: string | null): string | null {
  if (!birthday) return null
  const bd = new Date(birthday + 'T00:00:00')
  if (Number.isNaN(bd.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - bd.getFullYear()
  const mDiff = now.getMonth() - bd.getMonth()
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < bd.getDate())) years--
  if (years < 1) {
    const months =
      (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth())
    return `${Math.max(0, months)} mo old`
  }
  return `${years} yr old`
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const statusColors: Record<string, string> = {
  confirmed: 'bg-secondary/10 text-secondary',
  completed: 'bg-sage-light text-sage',
  cancelled: 'bg-red-50 text-red-500',
}

function HistoryItem({ booking }: { booking: PetBookingHistoryItem }) {
  const service = getServiceById(booking.service_id)
  const name = service?.name || LEGACY_SERVICE_NAMES[booking.service_id] || booking.service_id
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-soft">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-warm-dark">{name}</p>
        <p className="flex items-center gap-1.5 text-xs text-warm-gray">
          <Calendar className="h-3 w-3" />
          {formatDate(booking.date)}
        </p>
      </div>
      <span
        className={`ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
          statusColors[booking.status]
        }`}
      >
        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
      </span>
    </div>
  )
}

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [pet, setPet] = useState<PetWithHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)

  // Care notes (owner editable) + groomer notes (admin editable) local draft state.
  const [careNotesDraft, setCareNotesDraft] = useState('')
  const [careNotesSaving, setCareNotesSaving] = useState(false)
  const [groomerNotesDraft, setGroomerNotesDraft] = useState('')
  const [groomerNotesSaving, setGroomerNotesSaving] = useState(false)

  const [toasts, setToasts] = useState<ToastData[]>([])
  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  )
  const showToast = (message: string, type: ToastData['type'] = 'success') =>
    setToasts((prev) =>
      prev.some((t) => t.message === message)
        ? prev
        : [...prev, { id: Date.now(), message, type }],
    )

  useEffect(() => {
    if (!id) return
    apiFetch<PetWithHistory>(`/api/pets/${id}`)
      .then((p) => {
        setPet(p)
        setCareNotesDraft(p.care_notes ?? '')
        setGroomerNotesDraft(p.groomer_notes ?? '')
      })
      .catch((err) => {
        console.error('Failed to fetch pet:', err)
        setError(err.message || 'Failed to load pet')
      })
      .finally(() => setLoading(false))
  }, [id])

  const saveCareNotes = async () => {
    if (!pet) return
    setCareNotesSaving(true)
    try {
      const updated = await apiFetch<Pet>(`/api/pets/${pet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ care_notes: careNotesDraft.trim() || null }),
      })
      setPet({ ...pet, ...updated })
      showToast('Care notes saved')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setCareNotesSaving(false)
    }
  }

  const saveGroomerNotes = async () => {
    if (!pet) return
    setGroomerNotesSaving(true)
    try {
      const updated = await apiFetch<Pet>(`/api/pets/${pet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ groomer_notes: groomerNotesDraft.trim() || null }),
      })
      setPet({ ...pet, ...updated })
      showToast('Groomer notes saved')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setGroomerNotesSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pet) return
    const ok = window.confirm(`Delete ${pet.name}? This cannot be undone from the app.`)
    if (!ok) return
    try {
      await apiFetch(`/api/pets/${pet.id}`, { method: 'DELETE' })
      navigate('/my-pets')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background pt-20">
        <DogLoader />
      </div>
    )
  }

  if (error || !pet) {
    return (
      <div className="min-h-screen bg-background px-6 pb-20 pt-28">
        <div className="mx-auto max-w-[720px]">
          <div className="rounded-3xl bg-red-50 p-8 text-center">
            <p className="mb-2 font-semibold text-red-600">Pet not found</p>
            <p className="mb-4 text-sm text-red-500">{error || 'This pet no longer exists.'}</p>
            <Link
              to="/my-pets"
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2 text-sm font-bold text-white no-underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to My Dogs
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const ageLabel = computeAge(pet.birthday)

  return (
    <div className="min-h-screen bg-background px-6 pb-20 pt-28">
      <div className="mx-auto max-w-[720px]">
        {/* Back link */}
        <Link
          to={isAdmin ? '/admin' : '/my-pets'}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-warm-gray no-underline transition-colors hover:text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAdmin ? 'Back to Admin' : 'Back to My Dogs'}
        </Link>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl bg-white shadow-soft"
        >
          <div className="h-1.5 bg-gradient-to-r from-secondary via-sky-deep to-sky" />

          <div className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-start">
            <PetAvatar photoUrl={pet.photo_url} name={pet.name} size="xl" />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1 className="font-display text-3xl font-bold text-warm-dark">{pet.name}</h1>
              {pet.breed && <p className="text-warm-gray">{pet.breed}</p>}

              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {pet.size && (
                  <span className="rounded-full bg-sky/40 px-3 py-1 text-xs font-semibold text-secondary">
                    {sizeLabels[pet.size]}
                  </span>
                )}
                {ageLabel && (
                  <span className="rounded-full bg-sage-light px-3 py-1 text-xs font-semibold text-sage">
                    {ageLabel}
                  </span>
                )}
                {pet.birthday && (
                  <span className="rounded-full bg-sky/20 px-3 py-1 text-xs font-semibold text-warm-gray">
                    🎂 {formatDate(pet.birthday)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                <button
                  onClick={() => setShowEdit(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                {!isAdmin && (
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-200 px-4 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Care notes */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-secondary">
            Care Notes
          </h2>
          <div className="rounded-3xl bg-white p-5 shadow-soft">
            <textarea
              value={careNotesDraft}
              onChange={(e) => setCareNotesDraft(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Allergies, temperament, favorite treats…"
              className="w-full resize-none rounded-xl border-2 border-sky bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-secondary focus:outline-none"
            />
            {careNotesDraft !== (pet.care_notes ?? '') && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={saveCareNotes}
                  disabled={careNotesSaving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <Save className="h-3.5 w-3.5" />
                  {careNotesSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Groomer notes — admin only */}
        {isAdmin && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">
              Groomer Notes <span className="font-normal text-warm-gray">(private — not visible to client)</span>
            </h2>
            <div className="rounded-3xl bg-primary/5 p-5 shadow-soft">
              <textarea
                value={groomerNotesDraft}
                onChange={(e) => setGroomerNotesDraft(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Behavior warnings, things the client shouldn't see…"
                className="w-full resize-none rounded-xl border-2 border-primary/30 bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-primary focus:outline-none"
              />
              {groomerNotesDraft !== (pet.groomer_notes ?? '') && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={saveGroomerNotes}
                    disabled={groomerNotesSaving}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {groomerNotesSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Grooming history */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-warm-gray">
            Grooming History
          </h2>
          {pet.booking_history.length === 0 ? (
            <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
              <p className="text-sm text-warm-gray">No past appointments yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pet.booking_history.map((b) => (
                <HistoryItem key={b.id} booking={b} />
              ))}
            </div>
          )}
        </section>
      </div>

      {showEdit && (
        <PetFormModal
          pet={pet}
          ownerId={pet.user_id}
          onClose={() => setShowEdit(false)}
          onSaved={(updated, options) => {
            setPet((prev) => (prev ? { ...prev, ...updated } : prev))
            if (options?.photoFailed) {
              showToast(`Photo upload failed: ${options.photoFailed}`, 'error')
            } else {
              showToast('Pet updated!')
            }
          }}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
