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
      'A refreshing bath for small pups — shampoo, blow dry, nail trim, and all the finishing touches.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
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
      'Complete grooming for small pups: bath, haircut, styling, and all the finishing touches with extra gentleness.',
    features: [
      'Full-body haircut & styling',
      'De-shedding treatment',
      'Face, paw & sanitary trim',
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
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
      'A thorough bath for medium-sized pups. Clean, fresh, and ready to cuddle.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
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
    price: 125,
    description:
      'The full spa experience for medium-sized pups. Everything they need to look and feel amazing, from nose to tail.',
    features: [
      'Full-body haircut & styling',
      'De-shedding treatment',
      'Face, paw & sanitary trim',
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
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
      'A deep-clean bath for bigger pups. Premium products and extra care for their coat.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
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
      'Extra time and care for bigger pups. Includes de-shedding treatment. No rushing, no stress, just love.',
    features: [
      'Full-body haircut & styling',
      'De-shedding treatment',
      'Face, paw & sanitary trim',
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
    accentColor: 'peach',
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
