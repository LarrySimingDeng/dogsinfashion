import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import PetPhotoUpload from './PetPhotoUpload'
import { SIZE_WEIGHT_RANGES } from '../data/services'
import { photoUrlToPath } from '../lib/petPhoto'
import type { Pet, PetSize } from '../types/pet'

interface Props {
  /** Existing pet to edit. If null/undefined, modal creates a new pet. */
  pet?: Pet | null
  /** Owner user_id (admin may be editing a client's pet — photo goes under their folder). */
  ownerId: string
  onClose: () => void
  onSaved: (pet: Pet, options?: { photoFailed?: string }) => void
}

interface FormState {
  name: string
  breed: string
  size: PetSize | ''
  birthday: string
  care_notes: string
}

function petToForm(pet: Pet | null | undefined): FormState {
  return {
    name: pet?.name ?? '',
    breed: pet?.breed ?? '',
    size: pet?.size ?? '',
    birthday: pet?.birthday ?? '',
    care_notes: pet?.care_notes ?? '',
  }
}

/**
 * Upload a validated/resized blob to Supabase Storage and return the public URL.
 * Uses a random token in the filename so URLs aren't enumerable and CDN caching
 * doesn't serve stale images after re-upload. Fire-and-forget cleans up the
 * previous photo so old files don't pile up.
 */
async function uploadPhoto(
  blob: Blob,
  ownerId: string,
  petId: string,
  previousUrl: string | null,
): Promise<string> {
  const token = crypto.randomUUID().slice(0, 8)
  const path = `${ownerId}/${petId}-${token}.jpg`

  const { error: uploadErr } = await supabase.storage
    .from('pet-photos')
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (uploadErr) throw uploadErr

  const { data: { publicUrl } } = supabase.storage.from('pet-photos').getPublicUrl(path)

  // Fire-and-forget cleanup of the previous photo.
  const oldPath = photoUrlToPath(previousUrl)
  if (oldPath && oldPath !== path) {
    supabase.storage
      .from('pet-photos')
      .remove([oldPath])
      .then(({ error: rmErr }) => {
        if (rmErr) console.error('[pet-photo] cleanup previous failed:', rmErr)
      })
  }

  return publicUrl
}

export default function PetFormModal({ pet, ownerId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(petToForm(pet))
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(pet)

  // Lock body scroll while modal is open to prevent background page scrolling on mobile.
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  const buildPayload = () => ({
    name: form.name.trim(),
    breed: form.breed.trim() || undefined,
    size: form.size || undefined,
    birthday: form.birthday || undefined,
    care_notes: form.care_notes.trim() || undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Please give your pup a name.')
      return
    }
    setSaving(true)

    try {
      // Step 1: create or update the pet row.
      let savedPet: Pet
      if (isEdit && pet) {
        savedPet = await apiFetch<Pet>(`/api/pets/${pet.id}`, {
          method: 'PATCH',
          body: JSON.stringify(buildPayload()),
        })
      } else {
        savedPet = await apiFetch<Pet>('/api/pets', {
          method: 'POST',
          body: JSON.stringify(buildPayload()),
        })
      }

      // Step 2: if there's a pending local photo, upload it and patch photo_url.
      // On photo failure we still count the save as successful — the pet row
      // exists and the user can retry photo upload from Edit.
      if (pendingPhotoBlob) {
        try {
          const publicUrl = await uploadPhoto(
            pendingPhotoBlob,
            ownerId,
            savedPet.id,
            pet?.photo_url ?? null,
          )
          savedPet = await apiFetch<Pet>(`/api/pets/${savedPet.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ photo_url: publicUrl }),
          })
          onSaved(savedPet)
        } catch (photoErr) {
          console.error('[pet-form] photo upload failed:', photoErr)
          const reason = photoErr instanceof Error ? photoErr.message : String(photoErr)
          onSaved(savedPet, { photoFailed: reason })
        }
      } else {
        onSaved(savedPet)
      }

      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-warm-dark">
            {isEdit ? 'Edit Pet' : 'Add a New Pet'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-sky/40" aria-label="Close">
            <X className="h-5 w-5 text-warm-gray" />
          </button>
        </div>

        {/* Photo picker — local preview, uploaded at submit time. */}
        <div className="mb-5">
          <PetPhotoUpload
            petName={form.name || 'your pup'}
            currentPhotoUrl={pet?.photo_url ?? null}
            onBlobChange={setPendingPhotoBlob}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-warm-dark">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Buddy"
              className="w-full rounded-xl border-2 border-sky bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-secondary focus:outline-none"
              maxLength={60}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-warm-dark">Breed</label>
            <input
              type="text"
              value={form.breed}
              onChange={(e) => setForm({ ...form, breed: e.target.value })}
              placeholder="Golden Retriever"
              className="w-full rounded-xl border-2 border-sky bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-secondary focus:outline-none"
              maxLength={80}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-warm-dark">Size</label>
            <div className="grid grid-cols-3 gap-2">
              {(['small', 'medium', 'large'] as const).map((s) => {
                const selected = form.size === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, size: selected ? '' : s })}
                    className={`flex flex-col items-center rounded-xl border-2 px-2 py-2 transition-colors ${
                      selected
                        ? 'border-secondary bg-secondary text-white'
                        : 'border-sky text-warm-dark hover:bg-sky/20'
                    }`}
                  >
                    <span className="text-sm font-semibold">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                    <span
                      className={`text-[11px] ${
                        selected ? 'text-white/80' : 'text-warm-gray'
                      }`}
                    >
                      {SIZE_WEIGHT_RANGES[s]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-warm-dark">Birthday</label>
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              className="w-full rounded-xl border-2 border-sky bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-secondary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-warm-dark">
              Care Notes{' '}
              <span className="text-xs font-normal text-warm-gray">
                (allergies, temperament, favorites…)
              </span>
            </label>
            <textarea
              value={form.care_notes}
              onChange={(e) => setForm({ ...form, care_notes: e.target.value })}
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border-2 border-sky bg-white px-4 py-2.5 text-sm text-warm-dark focus:border-secondary focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border-2 border-sky px-4 py-2.5 text-sm font-bold text-warm-dark transition-colors hover:bg-sky/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Pet'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
