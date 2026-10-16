// Client HTTP vers hertz-server. Le token JWT est joint en Bearer quand présent.
// En cas d'échec réseau, ApiError(status 0) au lieu d'une exception fetch brute.
const BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001"

const TOKEN_KEY = "hertz-auth-token"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // stockage indisponible : session mémoire uniquement
  }
}

export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError("Serveur injoignable. Vérifiez que le backend tourne.", 0)
  }
  if (res.status === 204) return undefined as T
  let payload: { error?: string } | null = null
  try {
    payload = (await res.json()) as { error?: string }
  } catch {
    payload = null
  }
  if (!res.ok) {
    throw new ApiError(payload?.error ?? `Erreur ${res.status}`, res.status)
  }
  return payload as T
}

// URL de téléchargement PDF (le token passe en query : nouvel onglet).
export function exportUrl(path: string): string {
  const sep = path.includes("?") ? "&" : "?"
  return `${BASE}${path}${sep}token=${encodeURIComponent(getToken() ?? "")}`
}
