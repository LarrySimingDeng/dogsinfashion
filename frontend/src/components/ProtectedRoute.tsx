import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
  requireClient?: boolean
}

export default function ProtectedRoute({ children, requireAdmin, requireClient }: Props) {
  const { user, profile, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  if (requireClient && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
