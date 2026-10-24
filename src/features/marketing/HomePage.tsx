import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Icon from "@/shared/components/Icon"
import Logo from "@/shared/components/Logo"
import { HERO_PHOTO } from "@/shared/data/mockData"
import { ROUTES } from "@/app/routes"
import { apiFetch } from "@/shared/api/client"

const MODULES: Array<[string, string, string, string]> = [
  [
    "01",
    "Locations maîtrisées",
    "Gérez les contrats courte et longue durée, les échéances et les retours depuis un espace unique.",
    "rental",
  ],
  [
    "02",
    "Flotte sous contrôle",
    "Suivez la disponibilité, l’état, les mouvements et l’historique complet de chaque véhicule.",
    "car",
  ],
  [
    "03",
    "Réservations suivies",
    "Enregistrez chaque demande et distinguez immédiatement les réservations abouties ou non abouties.",
    "booking",
  ],
  [
    "04",
    "Décisions éclairées",
    "Analysez le chiffre d’affaires, l’utilisation et la rotation du parc grâce à des indicateurs fiables.",
    "stats",
  ],
]

export default function HomePage() {
  const [vehiclesTotal, setVehiclesTotal] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    apiFetch<{ vehiclesTotal: number }>("/api/public/metrics")
      .then((metrics) => {
        if (active) setVehiclesTotal(metrics.vehiclesTotal)
      })
      .catch(() => {
        if (active) setVehiclesTotal(null)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main>
      <header className="public-header">
        <Link to={ROUTES.home} className="logo-button" aria-label="Accueil">
          <Logo />
        </Link>
        <nav>
          <button className="active">Accueil</button>
          <Link
            to={ROUTES.login}
            className="login-link"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            Espace responsable <Icon name="arrow" size={17} />
          </Link>
        </nav>
      </header>

      <section className="home-hero">
        <div
          className="home-photo"
          style={{ backgroundImage: `url(${HERO_PHOTO})` }}
        />
        <div className="home-overlay" />
        <div className="hero-copy">
          <p className="kicker yellow">GESTION DE LOCATION AUTOMOBILE</p>
          <h1>
            Toute votre activité.
            <br />
            <em>Une seule plateforme.</em>
          </h1>
          <p>
            Une solution centralisée pour piloter les véhicules, les locations,
            les réservations, les clients et les performances de Hertz Bénin.
          </p>
          <Link
            to={ROUTES.login}
            className="primary"
            style={{ textDecoration: "none" }}
          >
            Accéder à l’espace de gestion <Icon name="arrow" />
          </Link>
        </div>
        <div className="hero-metric">
          <strong>{vehiclesTotal ?? "—"}</strong>
          <span>
            véhicules suivis
            <br />
            en temps réel
          </span>
        </div>
      </section>

      <section className="home-intro">
        <div>
          <p className="kicker">UNE VISION À 360°</p>
          <h2>
            Gérez mieux.
            <br />
            Servez plus vite.
          </h2>
        </div>
        <p>
          De l’acquisition d’un véhicule à sa cession, chaque opération est
          enregistrée, accessible et exploitable par les responsables autorisés.
        </p>
      </section>

      <section className="module-cards">
        {MODULES.map(([n, title, text, icon]) => (
          <article key={n}>
            <span>{n}</span>
            <div className="feature-icon">
              <Icon name={icon} />
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="home-cta">
        <div>
          <p className="kicker yellow">HERTZ MANAGEMENT</p>
          <h2>
            La fiabilité au cœur
            <br />
            de chaque opération.
          </h2>
        </div>
        <Link
          to={ROUTES.login}
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "50px",
            padding: "17px 20px",
            border: "1px solid #555",
            background: "transparent",
            color: "white",
            fontSize: "11px",
            fontWeight: "bold",
            textTransform: "uppercase",
          }}
        >
          Se connecter <Icon name="arrow" />
        </Link>
      </section>

      <footer className="public-footer">
        <Logo light />
        <p>
          Solution interne de gestion des activités de location Hertz Bénin.
        </p>
        <span>© 2026 Hertz Bénin · Accès sécurisé</span>
      </footer>
    </main>
  )
}
