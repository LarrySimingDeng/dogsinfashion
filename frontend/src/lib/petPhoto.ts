// Shared between PetPhotoUpload (for re-upload cleanup) and anywhere else
// that needs to derive the storage bucket path from a public URL.
//
// Supabase Storage `remove()` expects a bucket-relative path like
// `user-123/pet-abc-xyz.jpg`, not the full public URL.

export function photoUrlToPath(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = '/pet-photos/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}
