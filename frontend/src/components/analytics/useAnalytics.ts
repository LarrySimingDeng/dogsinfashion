import { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../../lib/api'
import { getServiceById } from '../../data/services'

interface Booking {
  id: string
  user_id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  dog_name: string
  dog_breed: string | null
  address: string
  notes: string | null
  status: 'confirmed' | 'completed' | 'cancelled'
  created_at: string
}

export interface TrendPoint {
  label: string
  revenue: number
}

export interface ServiceShare {
  name: string
  count: number
  color: string
}

export interface StatusCount {
  status: string
  count: number
  color: string
}

export interface BusyDay {
  day: string
  count: number
}

export interface BusyHour {
  hour: string
  count: number
}

export type TrendPeriod = 'daily' | 'weekly' | 'monthly'

export function useAnalytics() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Booking[]>('/api/bookings')
      .then(setBookings)
      .catch((err) => console.error('Failed to fetch bookings:', err))
      .finally(() => setLoading(false))
  }, [])

  const completed = useMemo(
    () => bookings.filter((b) => b.status === 'completed'),
    [bookings],
  )

  const getPrice = (serviceId: string): number => {
    return getServiceById(serviceId)?.price ?? 0
  }

  // Revenue cards
  const revenueToday = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    return completed
      .filter((b) => {
        const bd = new Date(b.date + 'T00:00:00')
        return bd.getFullYear() === y && bd.getMonth() === m && bd.getDate() === d
      })
      .reduce((sum, b) => sum + getPrice(b.service_id), 0)
  }, [completed])

  const revenueThisWeek = useMemo(() => {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((day + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return completed
      .filter((b) => {
        const bd = new Date(b.date + 'T00:00:00')
        return bd >= monday && bd <= sunday
      })
      .reduce((sum, b) => sum + getPrice(b.service_id), 0)
  }, [completed])

  const revenueThisMonth = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    return completed
      .filter((b) => {
        const bd = new Date(b.date + 'T00:00:00')
        return bd.getFullYear() === y && bd.getMonth() === m
      })
      .reduce((sum, b) => sum + getPrice(b.service_id), 0)
  }, [completed])

  const revenueTotal = useMemo(
    () => completed.reduce((sum, b) => sum + getPrice(b.service_id), 0),
    [completed],
  )

  // Revenue trend
  const trendData = useMemo(() => {
    const buildDaily = (): TrendPoint[] => {
      const points: TrendPoint[] = []
      const now = new Date()
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const label = `${d.getMonth() + 1}/${d.getDate()}`
        const rev = completed
          .filter((b) => b.date === key)
          .reduce((s, b) => s + getPrice(b.service_id), 0)
        points.push({ label, revenue: rev })
      }
      return points
    }

    const buildWeekly = (): TrendPoint[] => {
      const points: TrendPoint[] = []
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - i * 7)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
        const rev = completed
          .filter((b) => {
            const bd = new Date(b.date + 'T00:00:00')
            return bd >= weekStart && bd <= weekEnd
          })
          .reduce((s, b) => s + getPrice(b.service_id), 0)
        points.push({ label, revenue: rev })
      }
      return points
    }

    const buildMonthly = (): TrendPoint[] => {
      const points: TrendPoint[] = []
      const now = new Date()
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = d.getMonth()
        const label = `${months[m]} ${y !== now.getFullYear() ? y : ''}`
        const rev = completed
          .filter((b) => {
            const bd = new Date(b.date + 'T00:00:00')
            return bd.getFullYear() === y && bd.getMonth() === m
          })
          .reduce((s, b) => s + getPrice(b.service_id), 0)
        points.push({ label: label.trim(), revenue: rev })
      }
      return points
    }

    return { daily: buildDaily(), weekly: buildWeekly(), monthly: buildMonthly() }
  }, [completed])

  // Service breakdown
  const serviceBreakdown = useMemo((): ServiceShare[] => {
    const colorMap: Record<string, string> = {
      small: '#A8D4F0',
      medium: '#FDE9A6',
      large: '#FDDCBD',
    }
    const map = new Map<string, { count: number; color: string }>()
    for (const b of completed) {
      const svc = getServiceById(b.service_id)
      const name = svc?.name ?? b.service_id
      const color = svc ? (colorMap[svc.size] ?? '#E8975E') : '#ccc'
      const entry = map.get(name) ?? { count: 0, color }
      entry.count++
      map.set(name, entry)
    }
    return Array.from(map.entries()).map(([name, { count, color }]) => ({ name, count, color }))
  }, [completed])

  // Booking status distribution
  const statusCounts = useMemo((): StatusCount[] => {
    const counts: Record<string, number> = { confirmed: 0, completed: 0, cancelled: 0 }
    for (const b of bookings) {
      counts[b.status] = (counts[b.status] ?? 0) + 1
    }
    return [
      { status: 'Confirmed', count: counts['confirmed'] ?? 0, color: '#5BA4D9' },
      { status: 'Completed', count: counts['completed'] ?? 0, color: '#B0CDA7' },
      { status: 'Cancelled', count: counts['cancelled'] ?? 0, color: '#F87171' },
    ]
  }, [bookings])

  // Busiest times
  const busiestDays = useMemo((): BusyDay[] => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const counts = new Array<number>(7).fill(0)
    for (const b of bookings.filter((b) => b.status !== 'cancelled')) {
      const d = new Date(b.date + 'T00:00:00').getDay()
      counts[d] = (counts[d] ?? 0) + 1
    }
    return days.map((day, i) => ({ day, count: counts[i] ?? 0 }))
  }, [bookings])

  const busiestHours = useMemo((): BusyHour[] => {
    const counts = new Map<number, number>()
    for (const b of bookings.filter((b) => b.status !== 'cancelled')) {
      const h = parseInt(b.start_time.split(':')[0] ?? '0', 10)
      counts.set(h, (counts.get(h) ?? 0) + 1)
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0])
    return sorted.map(([h, count]) => {
      const ampm = h >= 12 ? 'PM' : 'AM'
      const dh = h === 0 ? 12 : h > 12 ? h - 12 : h
      return { hour: `${dh} ${ampm}`, count }
    })
  }, [bookings])

  // Customer insights
  const totalCustomers = useMemo(
    () => new Set(bookings.map((b) => b.user_id)).size,
    [bookings],
  )

  const newCustomersThisMonth = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    // Find earliest booking per user
    const earliest = new Map<string, Date>()
    for (const b of bookings) {
      const bd = new Date(b.date + 'T00:00:00')
      const prev = earliest.get(b.user_id)
      if (!prev || bd < prev) earliest.set(b.user_id, bd)
    }
    let count = 0
    for (const d of earliest.values()) {
      if (d.getFullYear() === y && d.getMonth() === m) count++
    }
    return count
  }, [bookings])

  const avgTicket = useMemo(() => {
    if (completed.length === 0) return 0
    return Math.round(revenueTotal / completed.length)
  }, [completed, revenueTotal])

  // Recent completed
  const recentCompleted = useMemo(
    () =>
      [...completed]
        .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time))
        .slice(0, 5),
    [completed],
  )

  return {
    loading,
    bookings,
    revenueToday,
    revenueThisWeek,
    revenueThisMonth,
    revenueTotal,
    trendData,
    serviceBreakdown,
    statusCounts,
    busiestDays,
    busiestHours,
    totalCustomers,
    newCustomersThisMonth,
    avgTicket,
    recentCompleted,
  }
}
