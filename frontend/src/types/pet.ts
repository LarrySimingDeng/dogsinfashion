export type PetSize = 'small' | 'medium' | 'large'

export interface Pet {
  id: string
  user_id: string
  name: string
  breed: string | null
  size: PetSize | null
  birthday: string | null  // YYYY-MM-DD
  photo_url: string | null
  care_notes: string | null
  groomer_notes?: string | null  // admin-only, absent from client responses
  archived_at: string | null
  created_at: string
  updated_at: string
}

// Shape returned by GET /api/pets/:id — includes booking history
export interface PetWithHistory extends Pet {
  booking_history: PetBookingHistoryItem[]
}

export interface PetBookingHistoryItem {
  id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  status: 'confirmed' | 'completed' | 'cancelled'
  address: string
}
