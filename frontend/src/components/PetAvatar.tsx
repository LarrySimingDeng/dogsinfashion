import { PawPrint } from 'lucide-react'

interface Props {
  photoUrl?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeMap = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-lg',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-32 w-32 text-4xl',
}

const iconSizeMap = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
  xl: 'h-12 w-12',
}

/**
 * Circular pet avatar — photo when available, otherwise a friendly initial.
 * When there's no name either, falls back to a paw icon.
 */
export default function PetAvatar({ photoUrl, name, size = 'md', className = '' }: Props) {
  const initial = name?.trim().charAt(0).toUpperCase()

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeMap[size]} shrink-0 rounded-full object-cover ring-2 ring-sky/50 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeMap[size]} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-deep/30 to-secondary/30 font-display font-bold text-secondary ring-2 ring-sky/50 ${className}`}
      aria-label={name}
    >
      {initial || <PawPrint className={iconSizeMap[size]} />}
    </div>
  )
}
