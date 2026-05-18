import { config } from '../config.js'

const BUSINESS_TIME_ZONE = 'America/Los_Angeles'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getTodayInBusinessTz(now: Date = new Date()): string {
  return DATE_FORMATTER.format(now)
}

function addDaysToIsoDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Invalid date string: ${dateStr}`)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const ny = dt.getUTCFullYear()
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(dt.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

export function getEarliestBookingDate(now: Date = new Date()): string {
  return addDaysToIsoDate(getTodayInBusinessTz(now), config.MIN_BOOKING_LEAD_DAYS)
}

export function isBeforeEarliestBookingDate(dateStr: string, now: Date = new Date()): boolean {
  return dateStr < getEarliestBookingDate(now)
}
