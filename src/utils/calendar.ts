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

function toGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function addToGoogleCalendar(data: BookingData): void {
  const service = getServiceById(data.serviceId)
  if (!service) return

  const start = new Date(`${data.date}T${data.time}`)
  const end = new Date(start.getTime() + service.duration * 60 * 60 * 1000)

  const title = encodeURIComponent(
    `Dogs in Fashion: ${service.name} — ${data.dogName}`,
  )
  const details = encodeURIComponent(
    [
      'Dogs in Fashion Mobile Grooming',
      '',
      `Client: ${data.clientName}`,
      `Phone: ${data.clientPhone || 'N/A'}`,
      `Dog: ${data.dogName}${data.dogBreed ? ` (${data.dogBreed})` : ''}`,
      `Service: ${service.name}`,
      `Duration: ${service.duration} hours`,
      `Price: $${service.price}`,
      data.notes ? `Notes: ${data.notes}` : '',
      '',
      'Groomer: Doris — (916) 287-1878',
      'Email: dorisliu0905@gmail.com',
      'Web: www.dogsinfashion.com',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  const location = encodeURIComponent(
    data.address || 'Mobile service — client address',
  )

  const url =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${title}` +
    `&dates=${toGCalDate(start)}/${toGCalDate(end)}` +
    `&details=${details}` +
    `&location=${location}`

  window.open(url, '_blank')
}
