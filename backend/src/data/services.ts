// Service durations in hours
export const SERVICE_DURATIONS: Record<string, number> = {
  'bath-small': 1,
  'bath-medium': 1,
  'bath-large': 1,
  'groom-small': 2,
  'groom-medium': 2,
  'groom-large': 2,
  'groom-xl': 1, // legacy
}

export const SERVICE_NAMES: Record<string, string> = {
  'bath-small': 'Bath — Small',
  'bath-medium': 'Bath — Medium',
  'bath-large': 'Bath — Large',
  'groom-small': 'Full Groom — Small',
  'groom-medium': 'Full Groom — Medium',
  'groom-large': 'Full Groom — Large',
  'groom-xl': 'Full Groom — XL', // legacy
}

export const SERVICE_PRICES: Record<string, number> = {
  'bath-small': 70,
  'bath-medium': 85,
  'bath-large': 110,
  'groom-small': 110,
  'groom-medium': 140,
  'groom-large': 185,
}
