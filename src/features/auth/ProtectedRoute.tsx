import { Navigate, useLocation } from "react-router-dom"
import type { ReactNode } from "react"
import { useAuth } from "./AuthContext"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSessionLoading } = useAuth()
  const location = useLocation()
  if (isSessionLoading) return null
  if (!isAuthenticated) {
    return (
      <Navigate to="/connexion" replace state={{ from: location.pathname }} />
    )
  }
  return <>{children}</>
}
