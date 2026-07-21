import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-primary text-sm animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: pathname }} replace />

  // força troca de senha antes de qualquer outra rota
  if (user.must_change_password && pathname !== '/definir-senha') {
    return <Navigate to="/definir-senha" replace />
  }

  return children
}
