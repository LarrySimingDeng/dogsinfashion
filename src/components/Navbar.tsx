import { useState, useEffect } from 'react'
import { PawPrint, Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const links = [
  { href: '#about', label: 'About' },
  { href: '#services', label: 'Services' },
  { href: '#areas', label: 'Areas' },
  { href: '#how', label: 'How It Works' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 backdrop-blur-xl ${
        scrolled
          ? 'bg-background/95 shadow-soft'
          : 'bg-background/90'
      } border-b border-sky-deep/20`}
    >
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-3.5">
        <a
          href="#"
          className="flex items-center gap-2.5 font-display text-2xl font-bold text-secondary no-underline"
        >
          <PawPrint className="h-7 w-7" />
          Dogs in Fashion
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-semibold text-warm-dark transition-colors hover:text-secondary"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#booking"
            className="rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            Book Now
          </a>
        </div>

        {/* Hamburger */}
        <button
          className="p-1 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? (
            <X className="h-6 w-6 text-warm-dark" />
          ) : (
            <Menu className="h-6 w-6 text-warm-dark" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-sky md:hidden"
          >
            <div className="flex flex-col gap-1 bg-background px-6 pb-5 pt-2">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#booking"
                onClick={close}
                className="mt-2 rounded-full bg-secondary py-2.5 text-center text-sm font-bold text-white"
              >
                Book Now
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
