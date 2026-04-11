import { getServiceById } from '../data/services'

interface BookingData {
  clientName: string
  clientPhone: string
  dogName: string
  dogBreed: string
  serviceId: string
  date: string
  time: string
  address: string
  notes: string
}

const DORIS_PHONE = '+19162871878'
const DORIS_EMAIL = 'contact@dogsinfashion.com'

export function buildMessageBody(data: BookingData): string {
  const service = getServiceById(data.serviceId)
  const lines: string[] = [
    "Hi Doris! I'd like to book a grooming appointment with Dogs in Fashion.",
  ]

  if (data.clientName) lines.push(`Name: ${data.clientName}`)
  if (data.clientPhone) lines.push(`Phone: ${data.clientPhone}`)
  if (data.dogName) {
    let dogLine = `Dog: ${data.dogName}`
    if (data.dogBreed) dogLine += ` (${data.dogBreed})`
    lines.push(dogLine)
  }
  if (service) {
    lines.push(
      `Service: ${service.name} (${service.duration} hrs, $${service.price})`,
    )
  }
  if (data.date && data.time) {
    const d = new Date(`${data.date}T${data.time}`)
    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    lines.push(`Preferred: ${dateStr} at ${timeStr}`)
  }
  if (data.address) lines.push(`Address: ${data.address}`)
  if (data.notes) lines.push(`Notes: ${data.notes}`)
  lines.push('Thank you!')

  return lines.join('\n')
}

export function buildSmsLink(data: BookingData): string {
  const body = buildMessageBody(data)
  return `sms:${DORIS_PHONE}?body=${encodeURIComponent(body)}`
}

export function buildEmailLink(data: BookingData): string {
  const service = getServiceById(data.serviceId)
  const dogName = data.dogName || 'my dog'
  const subject = service
    ? `Grooming Appointment – ${dogName} – ${service.name}`
    : 'Grooming Appointment Request'
  const body = buildMessageBody(data)
  return `mailto:${DORIS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
