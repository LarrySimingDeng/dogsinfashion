import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { PawPrint, Menu, X, User, LogOut, Shield, CalendarCheck, Dog } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

const homeLinks = [
  { href: '#about', label: 'About' },
  { href: '#services', label: 'Services' },
  { href: '#areas', label: 'Areas' },
  { href: '#how', label: 'How It Works' },
]

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const isHome = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  const handleSignOut = async () => {
    await signOut()
    setDropdownOpen(false)
    navigate('/')
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 backdrop-blur-xl ${
        scrolled
          ? 'bg-background/95 shadow-soft'
          : 'bg-background/90'
      } border-b border-sky-deep/20`}
    >
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-3.5">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-display text-2xl font-bold text-secondary no-underline"
        >
          <PawPrint className="h-7 w-7" />
          Dogs in Fashion
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 md:flex">
          {isHome && homeLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-semibold text-warm-dark transition-colors hover:text-secondary"
            >
              {l.label}
            </a>
          ))}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full border-2 border-sky px-4 py-2 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/30"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                {profile?.name?.split(' ')[0] || 'Account'}
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-sky bg-white py-2 shadow-elevated"
                  >
                    {profile?.role === 'admin' ? (
                      <Link
                        to="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-warm-dark hover:bg-sky/30"
                      >
                        <Shield className="h-4 w-4" /> Admin Dashboard
                      </Link>
                    ) : (
                      <>
                        <Link
                          to="/my-pets"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-warm-dark hover:bg-sky/30"
                        >
                          <Dog className="h-4 w-4" /> My Dogs
                        </Link>
                        <Link
                          to="/my-bookings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-warm-dark hover:bg-sky/30"
                        >
                          <CalendarCheck className="h-4 w-4" /> My Bookings
                        </Link>
                      </>
                    )}
                    <hr className="my-1 border-sky" />
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-sm font-semibold text-warm-dark transition-colors hover:text-secondary"
            >
              Sign In
            </Link>
          )}

          <Link
            to={user ? '/book' : '/login'}
            className="rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            Book Now
          </Link>
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
              {isHome && homeLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                >
                  {l.label}
                </a>
              ))}
              {user ? (
                <>
                  {profile?.role === 'admin' ? (
                    <Link
                      to="/admin"
                      onClick={close}
                      className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                    >
                      Admin Dashboard
                    </Link>
                  ) : (
                    <>
                      <Link
                        to="/my-pets"
                        onClick={close}
                        className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                      >
                        My Dogs
                      </Link>
                      <Link
                        to="/my-bookings"
                        onClick={close}
                        className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                      >
                        My Bookings
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => { handleSignOut(); close() }}
                    className="rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={close}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-warm-dark transition-colors hover:bg-sky/40"
                >
                  Sign In
                </Link>
              )}
              <Link
                to={user ? '/book' : '/login'}
                onClick={close}
                className="mt-2 rounded-full bg-secondary py-2.5 text-center text-sm font-bold text-white"
              >
                Book Now
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
