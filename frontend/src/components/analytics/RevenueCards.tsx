import { DollarSign, TrendingUp, Calendar, Award } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  today: number
  week: number
  month: number
  total: number
}

const cards = [
  { key: 'today', label: 'Today', icon: DollarSign, color: 'text-primary' },
  { key: 'week', label: 'This Week', icon: TrendingUp, color: 'text-secondary' },
  { key: 'month', label: 'This Month', icon: Calendar, color: 'text-sage' },
  { key: 'total', label: 'All Time', icon: Award, color: 'text-primary' },
] as const

export default function RevenueCards({ today, week, month, total }: Props) {
  const values = { today, week, month, total }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
          className="rounded-2xl border-2 border-sky bg-white p-5"
        >
          <div className="mb-2 flex items-center gap-2">
            <card.icon className={`h-5 w-5 ${card.color}`} />
            <span className="text-sm font-semibold text-warm-gray">{card.label}</span>
          </div>
          <p className="font-display text-2xl font-bold text-warm-dark">
            ${values[card.key].toLocaleString()}
          </p>
        </motion.div>
      ))}
    </div>
  )
}
