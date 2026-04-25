// Display format: "(916) 287-1878"
// Wire/storage format: "+1 (916) 287-1878"
const DISPLAY_RE = /^\(\d{3}\) \d{3}-\d{4}$/

// Format a partial input as the user types: "9162871878" → "(916) 287-1878".
// Behavior mirrors the prior inline logic in BookingPage: at length 3 the
// closing ") " is appended (inviting the next digit), at length 6 the "-" is
// appended. Don't simplify the boundaries — that would change UX.
export function maskPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  let formatted = ''
  if (digits.length > 0) formatted = `(${digits.slice(0, 3)}`
  if (digits.length >= 3) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}`
  if (digits.length >= 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  return formatted
}

// Normalize an arbitrary phone string to display format, or null if it can't.
// Used to pre-fill a known phone (e.g. from a prior booking) into a form.
//   "+1 (916) 287-1878" → "(916) 287-1878"
//   "9162871878"        → "(916) 287-1878"
//   "1-916-287-1878"    → "(916) 287-1878"
//   "+1 916 287 1878"   → "(916) 287-1878"
//   "garbage"           → null
export function normalizePhoneToDisplay(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return null
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

export function isValidDisplayPhone(s: string): boolean {
  return DISPLAY_RE.test(s)
}
