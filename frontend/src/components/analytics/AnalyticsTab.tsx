import { useAnalytics } from './useAnalytics'
import RevenueCards from './RevenueCards'
import RevenueTrendChart from './RevenueTrendChart'
import ServiceBreakdownChart from './ServiceBreakdownChart'
import BookingStatusBar from './BookingStatusBar'
import BusiestTimesChart from './BusiestTimesChart'
import CustomerInsights from './CustomerInsights'
import RecentCompleted from './RecentCompleted'

export default function AnalyticsTab() {
  const {
    loading,
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
  } = useAnalytics()

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <RevenueCards
        today={revenueToday}
        week={revenueThisWeek}
        month={revenueThisMonth}
        total={revenueTotal}
      />

      <RevenueTrendChart data={trendData} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceBreakdownChart data={serviceBreakdown} />
        <BookingStatusBar data={statusCounts} />
      </div>

      <BusiestTimesChart days={busiestDays} hours={busiestHours} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CustomerInsights
          totalCustomers={totalCustomers}
          newCustomersThisMonth={newCustomersThisMonth}
          avgTicket={avgTicket}
        />
        <RecentCompleted bookings={recentCompleted} />
      </div>
    </div>
  )
}
