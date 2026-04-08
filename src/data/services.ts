export interface ServiceTier {
  id: string
  name: string
  label: string
  weightRange: string
  duration: number
  price: number
  description: string
  features: string[]
  accentColor: string
}

export const services: ServiceTier[] = [
  {
    id: 'groom-small',
    name: 'Full Groom — Small',
    label: 'Small',
    weightRange: '0 – 25 lbs',
    duration: 2.5,
    price: 115,
    description:
      'Complete grooming for small pups: bath, haircut, styling, and all the finishing touches with extra gentleness.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Full-body haircut & styling',
      'Face, paw & sanitary trim',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
    accentColor: 'sky-deep',
  },
  {
    id: 'groom-medium',
    name: 'Full Groom — Medium',
    label: 'Medium',
    weightRange: '26 – 50 lbs',
    duration: 2.5,
    price: 130,
    description:
      'The full spa experience for medium-sized pups. Everything they need to look and feel amazing, from nose to tail.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Full-body haircut & styling',
      'Face, paw & sanitary trim',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
    accentColor: 'butter',
  },
  {
    id: 'groom-large',
    name: 'Full Groom — Large',
    label: 'Large',
    weightRange: '51 – 80 lbs',
    duration: 3.5,
    price: 150,
    description:
      'Extra time and care for bigger pups. Includes de-shedding treatment. No rushing, no stress, just love.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Full-body haircut & styling',
      'De-shedding treatment',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
    accentColor: 'peach',
  },
  {
    id: 'groom-xl',
    name: 'Full Groom — XL',
    label: 'XL',
    weightRange: '81 – 110 lbs',
    duration: 3.5,
    price: 180,
    description:
      'Our most comprehensive session for the biggest fluffs. All the pampering your gentle giant deserves.',
    features: [
      'Premium shampoo & conditioner',
      'Blow dry & brush out',
      'Full-body haircut & styling',
      'De-shedding treatment',
      'Ear cleaning & nail trim',
      'Teeth brushing',
      'Bandana or bow',
    ],
    accentColor: 'sage',
  },
]

export function getServiceById(id: string): ServiceTier | undefined {
  return services.find((s) => s.id === id)
}
