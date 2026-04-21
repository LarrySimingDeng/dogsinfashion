import { useCallback, useState } from 'react'
import Hero from '../components/Hero'
import About from '../components/About'
import DogMarquee from '../components/DogMarquee'
import Services from '../components/Services'
import AddOns from '../components/AddOns'
import Results from '../components/Results'
import Areas from '../components/Areas'
import HowItWorks from '../components/HowItWorks'
import BookingCTA from '../components/BookingCTA'
import Footer from '../components/Footer'

export default function HomePage() {
  const [selectedService, setSelectedService] = useState('')

  const handleBookService = useCallback((id: string) => {
    setSelectedService(id)
    setTimeout(() => {
      document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  return (
    <>
      <Hero />
      <About />
      <DogMarquee />
      <Services onBookService={handleBookService} />
      <AddOns />
      <Results />
      <Areas />
      <HowItWorks />
      <BookingCTA preselectedService={selectedService} />
      <Footer />
    </>
  )
}
