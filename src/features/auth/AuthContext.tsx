import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { AuthUser } from "@/shared/data/types"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (email: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = "hertz-auth-user"

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AuthUser : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const login = useCallback((email: string) => {
    const next: AuthUser = {
      name: "Koffi Orou",
      email,
      role: "Responsable Hertz",
      initials: "KO",
    }
    setUser(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // stockage indisponible : session mémoire uniquement
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>")
  return ctx
}
