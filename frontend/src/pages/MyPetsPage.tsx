import { useState, useEffect, useCallback } from 'react'
import { PawPrint, Plus } from 'lucide-react'
import DogLoader from '../components/DogLoader'
import PetCard from '../components/PetCard'
import PetFormModal from '../components/PetFormModal'
import Toast, { ToastData } from '../components/Toast'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Pet } from '../types/pet'

export default function MyPetsPage() {
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Pet | null>(null)

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
    apiFetch<Pet[]>('/api/pets')
      .then(setPets)
      .catch((err) => {
        console.error('Failed to fetch pets:', err)
        setError(err.message || 'Failed to load pets')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSaved = (pet: Pet, options?: { photoFailed?: string }) => {
    setPets((prev) => {
      const i = prev.findIndex((p) => p.id === pet.id)
      if (i === -1) return [pet, ...prev]
      const next = [...prev]
      next[i] = pet
      return next
    })
    if (options?.photoFailed) {
      showToast(`Photo upload failed: ${options.photoFailed}`, 'error')
    } else {
      showToast(editing ? 'Pet updated!' : 'Pet added!')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background pt-20">
        <DogLoader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-6 pb-20 pt-28">
      <div className="mx-auto max-w-[720px]">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-warm-dark">My Dogs</h1>
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <Plus className="h-4 w-4" /> Add Pet
          </button>
        </div>

        {error ? (
          <div className="rounded-3xl bg-red-50 p-8 text-center">
            <p className="mb-2 font-semibold text-red-600">Error loading pets</p>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : pets.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-soft">
            <PawPrint className="mx-auto mb-4 h-12 w-12 text-sky-deep" />
            <h2 className="mb-2 font-display text-xl font-bold text-warm-dark">No pets yet</h2>
            <p className="mb-6 text-warm-gray">Add your first pup to skip typing details every booking.</p>
            <button
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
              className="rounded-full bg-secondary px-7 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              Add Your First Pup
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pets.map((pet, i) => (
              <PetCard key={pet.id} pet={pet} index={i} />
            ))}
          </div>
        )}
      </div>

      {showForm && user && (
        <PetFormModal
          pet={editing}
          ownerId={editing?.user_id ?? user.id}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onSaved={handleSaved}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
