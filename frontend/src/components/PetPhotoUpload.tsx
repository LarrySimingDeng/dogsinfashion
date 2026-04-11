import { useRef, useState, useEffect } from 'react'
import { Camera, Loader2, Undo2 } from 'lucide-react'
import PetAvatar from './PetAvatar'

interface Props {
  petName: string
  /** Existing saved photo URL (from the database). Shown when there's no pending local pick. */
  currentPhotoUrl: string | null
  /**
   * Called whenever the user picks or clears a local file. The blob is
   * already validated, EXIF-rotated, resized and re-encoded as JPEG —
   * the parent just needs to upload it at submit time.
   */
  onBlobChange: (blob: Blob | null) => void
}

const MAX_BYTES = 10 * 1024 * 1024   // 10 MB — generous because we resize anyway
const MAX_DIMENSION = 800

/**
 * Decode an image file into an HTMLCanvasElement, respecting EXIF orientation.
 *
 * Tries the fast path (`createImageBitmap` with `imageOrientation: 'from-image'`)
 * first, then falls back to an HTMLImageElement. The fallback matters for:
 *   - HEIC files from iPhone (Safari can decode via <img>, Chrome can't at all)
 *   - Older browsers without `createImageBitmap` options support
 *
 * Modern browsers (Safari 13.1+, Chrome 81+, Firefox 77+) automatically apply
 * EXIF orientation when rendering <img>, so drawing from <img> onto canvas
 * gives the same rotated result as `createImageBitmap`.
 */
async function decodeImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  // Fast path: createImageBitmap
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    const { width, height } = scaleDimensions(bitmap.width, bitmap.height)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return canvas
  } catch (fastErr) {
    console.warn('[pet-photo] createImageBitmap failed, falling back to <img>:', fastErr)
  }

  // Fallback path: HTMLImageElement
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image decode failed'))
    })
    const canvas = document.createElement('canvas')
    // naturalWidth/Height already reflects EXIF orientation on modern browsers.
    const { width, height } = scaleDimensions(img.naturalWidth, img.naturalHeight)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(img, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function scaleDimensions(w: number, h: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}

/**
 * File picker + local preview for pet photos. Does NOT upload — the parent
 * component (PetFormModal) is responsible for uploading at submit time so
 * that creating a pet and adding a photo is a single click.
 *
 * Display priority: local pending preview > saved photo > initial.
 */
export default function PetPhotoUpload({ petName, currentPhotoUrl, onBlobChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revoke object URL on unmount.
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    }
  }, [pendingPreview])

  const setPending = (blob: Blob | null) => {
    // Revoke the previous preview URL before replacing.
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingBlob(blob)
    setPendingPreview(blob ? URL.createObjectURL(blob) : null)
    onBlobChange(blob)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-selected later if needed.
    e.target.value = ''
    setError(null)

    // Accept any image type — iPhone HEIC, JPEG, PNG, WebP all welcome.
    // Some iOS versions report an empty file.type for HEIC, so also accept
    // a blank type if the filename ends with a known image extension.
    const looksLikeImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name)
    if (!looksLikeImage) {
      setError('Please pick an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is over 10 MB. Please pick a smaller one.')
      return
    }

    setProcessing(true)
    try {
      const canvas = await decodeImageToCanvas(file)
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
          'image/jpeg',
          0.85,
        ),
      )
      setPending(blob)
    } catch (err: unknown) {
      console.error('[pet-photo] processing failed:', err)
      // HEIC on desktop Chrome/Firefox/Edge will land here — those browsers
      // can't decode HEIC at all. Give a helpful hint.
      const name = file.name.toLowerCase()
      if (name.endsWith('.heic') || name.endsWith('.heif')) {
        setError(
          "Your browser can't read HEIC photos. Please use Safari, or export the photo as JPEG first.",
        )
      } else {
        setError("We couldn't read that image. Try a JPEG or PNG instead.")
      }
    } finally {
      setProcessing(false)
    }
  }

  const cancelPending = () => {
    setPending(null)
    setError(null)
  }

  // Display priority: local pending > saved > initial
  const displayUrl = pendingPreview ?? currentPhotoUrl
  const hasPending = pendingBlob !== null

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <PetAvatar photoUrl={displayUrl} name={petName} size="xl" />
        {processing && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        // image/* covers jpeg, png, webp, gif, heic, heif, bmp, svg…
        // On iOS this lets users pick HEIC directly from the photo library.
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={processing}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full bg-sky/40 px-4 py-2 text-sm font-semibold text-secondary transition-colors hover:bg-sky/60 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          {displayUrl ? 'Change Photo' : 'Add Photo'}
        </button>
        {hasPending && (
          <button
            type="button"
            disabled={processing}
            onClick={cancelPending}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-sky px-4 py-2 text-sm font-semibold text-warm-gray transition-colors hover:bg-sky/20"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        )}
      </div>

      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  )
}
