import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props {
  children: ReactNode
  roles?: string[]
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { user, loading, isAdmin, isProfesor } = useAuth()

  if (loading) return null

  if (!user) return <Navigate to="/login" replace />

  if (roles) {
    const hasRole = roles.some(r => r === 'admin' && isAdmin || r === 'profesor' && isProfesor)
    if (!hasRole) return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
