import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { AuthUser } from "@/shared/data/types"
import { apiFetch, getToken, setToken } from "@/shared/api/client"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

interface LoginResponse {
  token: string
  user: { id: number; nom: string; email: string; role: string }
}

const USER_KEY = "hertz-auth-user"

const AuthContext = createContext<AuthContextValue | null>(null)

function initialsOf(nom: string): string {
  const parts = nom.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase() || "?"
}

function toAuthUser(u: LoginResponse["user"]): AuthUser {
  return {
    name: u.nom,
    email: u.email,
    role: u.role === "admin" ? "Administrateur" : "Responsable Hertz",
    initials: initialsOf(u.nom),
  }
}

function readStoredUser(): AuthUser | null {
  try {
    if (!getToken()) return null
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    })
    const next = toAuthUser(data.user)
    setToken(data.token)
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(next))
    } catch {
      // stockage indisponible : session mémoire uniquement
    }
    setUser(next)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    try {
      localStorage.removeItem(USER_KEY)
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
