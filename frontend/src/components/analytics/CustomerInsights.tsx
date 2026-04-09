import { Users, UserPlus, Receipt } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  totalCustomers: number
  newCustomersThisMonth: number
  avgTicket: number
}

export default function CustomerInsights({ totalCustomers, newCustomersThisMonth, avgTicket }: Props) {
  const items = [
    { label: 'Total Customers', value: totalCustomers, icon: Users, color: 'text-secondary' },
    { label: 'New This Month', value: newCustomersThisMonth, icon: UserPlus, color: 'text-sage' },
    { label: 'Avg Ticket', value: `$${avgTicket}`, icon: Receipt, color: 'text-primary' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
      className="rounded-2xl border-2 border-sky bg-white p-5"
    >
      <h2 className="mb-4 font-display text-xl font-bold text-warm-dark">Customer Insights</h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky/20">
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div>
              <p className="text-sm text-warm-gray">{item.label}</p>
              <p className="font-display text-xl font-bold text-warm-dark">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
