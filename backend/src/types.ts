import type { Request } from 'express'

export interface AuthUser {
  id: string
  email: string
  role: 'client' | 'admin'
}

export interface AuthRequest extends Request {
  user?: AuthUser
}

export interface Booking {
  id: string
  user_id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  dog_breed: string | null
  phone: string | null
  address: string
  notes: string | null
  status: 'confirmed' | 'completed' | 'cancelled'
  google_event_id: string | null
  deposit_status: 'none' | 'paid' | 'refunded'
  deposit_paid_at: string | null
  created_at: string
  updated_at: string
}

export interface Availability {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

export interface BlockedDate {
  id: string
  date: string
  reason: string | null
  start_time: string | null
  end_time: string | null
}

export interface TimeSlot {
  start: string // "09:00"
  end: string   // "11:30"
}
