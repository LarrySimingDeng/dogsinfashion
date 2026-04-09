import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { motion } from 'framer-motion'
import type { StatusCount } from './useAnalytics'

interface Props {
  data: StatusCount[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: StatusCount }[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  if (!entry) return null
  return (
    <div className="rounded-xl border border-sky bg-white p-3 text-sm shadow-soft">
      <p className="font-semibold text-warm-dark">{entry.payload.status}</p>
      <p className="text-warm-gray">{entry.value} bookings</p>
    </div>
  )
}

export default function BookingStatusBar({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Booking Status</h2>
      {total === 0 ? (
        <p className="py-16 text-center text-warm-gray">No bookings yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis dataKey="status" tick={{ fontSize: 12, fill: '#7A7570' }} />
            <YAxis tick={{ fontSize: 12, fill: '#7A7570' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  )
}
