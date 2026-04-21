export interface ServiceTier {
  id: string
  name: string
  label: string
  type: 'bath' | 'groom'
  size: 'small' | 'medium' | 'large'
  weightRange: string
  duration: number
  price: number
  description: string
  features: string[]
  accentColor: string
}

// Single source of truth for "what weight maps to what size?"
// Used by both the service picker and the pet form so they always agree.
export const SIZE_WEIGHT_RANGES: Record<'small' | 'medium' | 'large', string> = {
  small: 'Under 20 lbs',
  medium: '20–50 lbs',
  large: 'Over 50 lbs',
}

const BATH_ESSENTIAL_FEATURES = [
  'Warm hand bath',
  'Premium shampoo',
  'Conditioner treatment',
  'Blow dry',
  'Brush out',
  'Ear cleaning — FREE gift',
]

const GROOM_LUXURY_FEATURES = [
  'Full-body haircut & styling',
  'De-shedding treatment',
  'Premium shampoo & conditioner',
  'Blow dry & brush out',
  'De-matting & mat removal',
  'Face trim',
  'Paw trim',
  'Sanitary trim',
  'Ear cleaning — FREE gift',
]

export const services: ServiceTier[] = [
  {
    id: 'bath-small',
    name: 'Bath — Small',
    label: 'Small',
    type: 'bath',
    size: 'small',
    weightRange: 'Under 20 lbs',
    duration: 1,
    price: 70,
    description:
      'Our Essential bath for small pups — warm hand bath, premium shampoo & conditioner, blow dry, and brush out.',
    features: BATH_ESSENTIAL_FEATURES,
    accentColor: 'sky-deep',
  },
  {
    id: 'groom-small',
    name: 'Full Groom — Small',
    label: 'Small',
    type: 'groom',
    size: 'small',
    weightRange: 'Under 20 lbs',
    duration: 2,
    price: 110,
    description:
      'The Luxury experience for small pups — bath PLUS full-body haircut, de-shedding, de-matting, and full face, paw & sanitary trim.',
    features: GROOM_LUXURY_FEATURES,
    accentColor: 'sky-deep',
  },
  {
    id: 'bath-medium',
    name: 'Bath — Medium',
    label: 'Medium',
    type: 'bath',
    size: 'medium',
    weightRange: '20–50 lbs',
    duration: 1,
    price: 85,
    description:
      'Our Essential bath for medium pups — warm hand bath, premium shampoo & conditioner, blow dry, and brush out.',
    features: BATH_ESSENTIAL_FEATURES,
    accentColor: 'butter',
  },
  {
    id: 'groom-medium',
    name: 'Full Groom — Medium',
    label: 'Medium',
    type: 'groom',
    size: 'medium',
    weightRange: '20–50 lbs',
    duration: 2,
    price: 140,
    description:
      'The Luxury experience for medium pups — bath PLUS full-body haircut, de-shedding, de-matting, and full face, paw & sanitary trim.',
    features: GROOM_LUXURY_FEATURES,
    accentColor: 'butter',
  },
  {
    id: 'bath-large',
    name: 'Bath — Large',
    label: 'Large',
    type: 'bath',
    size: 'large',
    weightRange: 'Over 50 lbs',
    duration: 1,
    price: 110,
    description:
      'Our Essential bath for bigger pups — warm hand bath, premium shampoo & conditioner, blow dry, and brush out.',
    features: BATH_ESSENTIAL_FEATURES,
    accentColor: 'peach',
  },
  {
    id: 'groom-large',
    name: 'Full Groom — Large',
    label: 'Large',
    type: 'groom',
    size: 'large',
    weightRange: 'Over 50 lbs',
    duration: 2,
    price: 185,
    description:
      'The Luxury experience for bigger pups — bath PLUS full-body haircut, de-shedding, de-matting, and full face, paw & sanitary trim. No rushing, no stress.',
    features: GROOM_LUXURY_FEATURES,
    accentColor: 'peach',
  },
]

export interface AddOn {
  id: string
  name: string
  price: string
  description: string
}

export const addOns: AddOn[] = [
  {
    id: 'nail-trim',
    name: 'Nail Trim',
    price: '$12',
    description:
      "Helps prevent painful splaying & splitting of your dog's nails.",
  },
  {
    id: 'nail-grind',
    name: 'Nail Grind + Trim',
    price: '$19',
    description:
      'Smooths out rough edges to reduce scratches while keeping nails shorter for longer.',
  },
  {
    id: 'teeth-brushing',
    name: 'Teeth Brushing & Breath Freshener',
    price: '$12',
    description:
      'Whitening & tartar-control gel to prevent build-up, plus a minty breath freshener.',
  },
  {
    id: 'anal-gland',
    name: 'Anal Gland Expression',
    price: '$12',
    description:
      'External check of anal sacs to help prevent build-up of fluid that can cause irritation.',
  },
  {
    id: 'deep-conditioner',
    name: 'Deep Coat Conditioner',
    price: '$18',
    description:
      'Deep-nourishing conditioning treatment for healthier, shinier coats.',
  },
  {
    id: 'paw-balm',
    name: 'Paw & Nose Balm',
    price: '$10',
    description:
      'Soothing balm for dry, cracked paw pads and noses.',
  },
]

export const LEGACY_SERVICE_NAMES: Record<string, string> = {
  'groom-xl': 'Full Groom — XL',
}

export function formatDuration(hours: number): string {
  if (hours === 1) return '1 hour'
  if (hours === 2) return '2 hours'
  const h = Math.floor(hours)
  const m = (hours - h) * 60
  return m > 0 ? `${h} hr ${m} min` : `${hours} hours`
}

export function getServiceById(id: string): ServiceTier | undefined {
  return services.find((s) => s.id === id)
}
