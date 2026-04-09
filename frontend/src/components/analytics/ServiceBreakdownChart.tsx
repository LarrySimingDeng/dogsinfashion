import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { motion } from 'framer-motion'
import type { ServiceShare } from './useAnalytics'

interface Props {
  data: ServiceShare[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  if (!entry) return null
  return (
    <div className="rounded-xl border border-sky bg-white p-3 text-sm shadow-soft">
      <p className="font-semibold text-warm-dark">{entry.name}</p>
      <p className="text-warm-gray">{entry.value} bookings</p>
    </div>
  )
}

export default function ServiceBreakdownChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl border-2 border-sky bg-white p-5"
      >
        <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Service Breakdown</h2>
        <p className="py-16 text-center text-warm-gray">No completed bookings yet</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Service Breakdown</h2>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs text-warm-dark">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
