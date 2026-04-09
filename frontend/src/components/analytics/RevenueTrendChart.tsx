import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { motion } from 'framer-motion'
import type { TrendPoint, TrendPeriod } from './useAnalytics'

interface Props {
  data: Record<TrendPeriod, TrendPoint[]>
}

const periods: { key: TrendPeriod; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  if (!entry) return null
  return (
    <div className="rounded-xl border border-sky bg-white p-3 text-sm shadow-soft">
      <p className="font-semibold text-warm-dark">{label}</p>
      <p className="text-primary">${entry.value.toLocaleString()}</p>
    </div>
  )
}

export default function RevenueTrendChart({ data }: Props) {
  const [period, setPeriod] = useState<TrendPeriod>('daily')

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-warm-dark">Revenue Trend</h2>
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                period === p.key
                  ? 'bg-secondary text-white'
                  : 'bg-sky/30 text-warm-dark hover:bg-sky/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data[period].every((d) => d.revenue === 0) ? (
        <p className="py-16 text-center text-warm-gray">No completed bookings yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data[period]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E8975E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#E8975E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#D6ECFA" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#7A7570' }} />
            <YAxis tick={{ fontSize: 12, fill: '#7A7570' }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#E8975E"
              strokeWidth={2}
              fill="url(#revGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  )
}
