import { useCallback, useRef, useState } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import About from './components/About'
import Services from './components/Services'
import Areas from './components/Areas'
import HowItWorks from './components/HowItWorks'
import BookingForm from './components/BookingForm'
import Footer from './components/Footer'

export default function App() {
  const [selectedService, setSelectedService] = useState('')
  const bookingRef = useRef<HTMLDivElement>(null)

  const handleBookService = useCallback((id: string) => {
    setSelectedService(id)
    // Small delay to let state update before scrolling
    setTimeout(() => {
      document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  return (
    <div ref={bookingRef}>
      <Navbar />
      <Hero />
      <About />
      <Services onBookService={handleBookService} />
      <Areas />
      <HowItWorks />
      <BookingForm preselectedService={selectedService} />
      <Footer />
    </div>
  )
}
