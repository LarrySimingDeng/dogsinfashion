import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import BookingPage from './pages/BookingPage'
import MyBookingsPage from './pages/MyBookingsPage'
import AdminDashboard from './pages/AdminDashboard'

function AppContent() {
  const { isRecovery } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // If user landed via a password-recovery link (even if Supabase
  // redirected them to "/" instead of "/login"), force them to /login
  // so they can actually set a new password.
  useEffect(() => {
    if (isRecovery && location.pathname !== '/login') {
      navigate('/login', { replace: true })
    }
  }, [isRecovery, location.pathname, navigate])

  // During recovery, render LoginPage immediately even before the URL
  // catches up, so we never flash HomePage / other pages.
  const recoveryButUrlNotSynced =
    isRecovery && location.pathname !== '/login'

  return (
    <>
      <Navbar />
      {recoveryButUrlNotSynced ? (
        <LoginPage />
      ) : (
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/book"
            element={
              <ProtectedRoute requireClient>
                <BookingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute requireClient>
                <MyBookingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
