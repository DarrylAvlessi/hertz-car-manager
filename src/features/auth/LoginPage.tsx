import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import Logo from "@/shared/components/Logo"
import Icon from "@/shared/components/Icon"
import { LOGIN_PHOTO } from "@/shared/data/mockData"
import { ROUTES } from "@/app/routes"
import { useAuth } from "@/features/auth/AuthContext"

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("responsable@hertz.bj")
  const [password, setPassword] = useState("hertz2025")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (isAuthenticated) return <Navigate to={ROUTES.dashboard} replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    login(email, password)
      .then(() => navigate(ROUTES.dashboard))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Connexion impossible")
        setPending(false)
      })
  }

  return (
    <main className="login-page">
      <section
        className="login-visual"
        style={{
          backgroundImage: `linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.12)), url(${LOGIN_PHOTO})`,
        }}
      >
        <Link to={ROUTES.home} aria-label="Retour accueil">
          <Logo light />
        </Link>
        <div>
          <p className="kicker yellow">ESPACE INTERNE</p>
          <h1>
            Pilotez l’activité
            <br />
            avec confiance.
          </h1>
          <p>Des données fiables pour des décisions plus rapides et un meilleur service client.</p>
        </div>
      </section>
      <section className="login-panel">
        <Link to={ROUTES.home} className="back-home" style={{ textDecoration: "none" }}>
          ← Retour à l’accueil
        </Link>
        <form onSubmit={submit}>
          <p className="kicker">ACCÈS RESPONSABLE</p>
          <h2>Connexion</h2>
          <p>Renseignez vos identifiants pour accéder à votre espace.</p>
          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>
          )}
          <label>
            <span>Adresse e-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Mot de passe</span>
            <div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "Masquer" : "Afficher"}
              </button>
            </div>
          </label>
          <div className="login-options">
            <label>
              <input type="checkbox" defaultChecked /> Se souvenir de moi
            </label>
            <button type="button">Mot de passe oublié ?</button>
          </div>
          <button className="primary full" type="submit" disabled={pending}>
            {pending ? "Connexion…" : "Se connecter"} <Icon name="arrow" />
          </button>
          <p className="security-note">Accès réservé au personnel autorisé de Hertz Bénin.</p>
        </form>
      </section>
    </main>
  )
}
