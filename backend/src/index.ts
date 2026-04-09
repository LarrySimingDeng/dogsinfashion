import { app } from './app.js'
import { config } from './config.js'
import { startReminderScheduler } from './jobs/reminder-scheduler.js'
import { startCalendarSync } from './jobs/calendar-sync.js'

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

app.listen(config.PORT, () => {
  console.log(`Backend running on http://localhost:${config.PORT}`)
  startReminderScheduler()
  startCalendarSync()
})
