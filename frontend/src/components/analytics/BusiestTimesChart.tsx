import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { motion } from 'framer-motion'
import type { BusyDay, BusyHour } from './useAnalytics'

interface Props {
  days: BusyDay[]
  hours: BusyHour[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  if (!entry) return null
  return (
    <div className="rounded-xl border border-sky bg-white p-3 text-sm shadow-soft">
      <p className="font-semibold text-warm-dark">{label}</p>
      <p className="text-warm-gray">{entry.value} bookings</p>
    </div>
  )
}

export default function BusiestTimesChart({ days, hours }: Props) {
  const hasData = days.some((d) => d.count > 0) || hours.some((h) => h.count > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Busiest Times</h2>
      {!hasData ? (
        <p className="py-16 text-center text-warm-gray">No bookings yet</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-warm-gray">By Day of Week</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={days} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6ECFA" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7A7570' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7A7570' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#5BA4D9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-warm-gray">By Hour</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hours} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6ECFA" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#7A7570' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7A7570' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#E8975E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.div>
  )
}
