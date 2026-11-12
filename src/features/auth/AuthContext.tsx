import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import type { ReactNode } from "react"

import type { AuthRole, AuthUser } from "@/shared/data/types"

import {
  apiFetch,
  AUTH_SESSION_EXPIRED_EVENT,
  getToken,
  setToken,
} from "@/shared/api/client"

interface AuthContextValue {
  user: AuthUser | null

  isAuthenticated: boolean

  isSessionLoading: boolean

  login: (email: string, password: string) => Promise<void>

  updateProfile: (profile: ProfileUpdate) => Promise<void>

  logout: () => void
}

interface LoginResponse {
  token: string

  user: {
    id: number

    nom: string

    prenom: string

    email: string

    role: AuthRole
  }
}

export interface ProfileUpdate {
  firstName: string

  lastName: string

  email: string

  currentPassword?: string

  newPassword?: string
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
    name: `${u.prenom} ${u.nom}`.trim(),

    firstName: u.prenom,

    lastName: u.nom,

    email: u.email,

    role: u.role,

    roleLabel:
      u.role === "superadmin"
        ? "Super administrateur"
        : u.role === "admin"
          ? "Administrateur"
          : "Responsable Hertz",

    initials: initialsOf(`${u.prenom} ${u.nom}`),
  }
}

function readStoredUser(): AuthUser | null {
  try {
    if (!getToken()) return null

    const raw = localStorage.getItem(USER_KEY)

    return raw ? JSON.parse(raw) as AuthUser : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const [isSessionLoading, setIsSessionLoading] = useState(true)

  const clearSession = useCallback(() => {
    setUser(null)

    setToken(null)

    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let active = true

    const handleExpiredSession = () => {
      clearSession()

      if (active) setIsSessionLoading(false)
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession)

    if (!getToken()) {
      setIsSessionLoading(false)
    } else {
      apiFetch<{ user: LoginResponse["user"] }>("/api/auth/me")

        .then((data) => {
          if (active) {
            const next = toAuthUser(data.user)

            setUser(next)

            try {
              localStorage.setItem(USER_KEY, JSON.stringify(next))
            } catch {
              // stockage indisponible : session mémoire uniquement
            }
          }
        })

        .catch(() => {
          clearSession()
        })

        .finally(() => {
          if (active) setIsSessionLoading(false)
        })
    }

    return () => {
      active = false

      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,

        handleExpiredSession,
      )
    }
  }, [clearSession])

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

  const updateProfile = useCallback(async (profile: ProfileUpdate) => {
    const data = await apiFetch<LoginResponse>("/api/auth/me", {
      method: "PUT",

      body: {
        nom: profile.lastName,

        prenom: profile.firstName,

        email: profile.email,

        currentPassword: profile.currentPassword,

        newPassword: profile.newPassword,
      },
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

  const logout = clearSession

  const value = useMemo(
    () => ({
      user,

      isAuthenticated: user !== null,

      isSessionLoading,

      login,

      updateProfile,

      logout,
    }),

    [user, isSessionLoading, login, updateProfile, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)

  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>")

  return ctx
}
