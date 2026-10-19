import { useEffect, useMemo, useState } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import Icon from "@/shared/components/Icon"
import Logo from "@/shared/components/Logo"
import { MODULE_ICONS } from "@/shared/data/mockData"
import { ROUTES } from "@/app/routes"
import { useAuth } from "@/features/auth/AuthContext"
import AddModal from "./components/AddModal"
import type { DashboardModule } from "@/shared/data/types"

export interface DashboardOutletContext {
  query: string
  onAdd: () => void
  onSeeLocations: () => void
}

const NAV: Array<{
  label: DashboardModule
  to: string
  badge?: string
}> = [
  { label: "Vue d’ensemble", to: ROUTES.overview },
  { label: "Commerciaux", to: ROUTES.commerciaux },
  { label: "Réservations", to: ROUTES.reservations, badge: "7" },
  { label: "Clients", to: ROUTES.clients },
  { label: "Statistiques", to: ROUTES.statistiques },
]

const FLEET_NAV = [
  { label: "Catégories véhicules", to: ROUTES.categoriesVehicules },
  { label: "Modèle véhicule", to: ROUTES.modelesVehicules },
  { label: "Garages", to: ROUTES.garages },
  { label: "Passages garage", to: ROUTES.passagesGarage },
  { label: "Réparations", to: ROUTES.reparations },
  { label: "Véhicules", to: ROUTES.vehicules },
  { label: "Mouvements véhicules", to: ROUTES.mouvementsVehicules },
  { label: "Ventes de véhicules", to: ROUTES.ventesVehicules },
] as const

const RENTAL_NAV = [
  { label: "Locations", to: ROUTES.locations },
  { label: "Prolongations", to: ROUTES.prolongations },
] as const

function formatCurrentDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .toUpperCase()
}

function moduleFromPath(pathname: string): DashboardModule {
  const found = [...NAV, ...FLEET_NAV, ...RENTAL_NAV].find((n) => n.to === pathname)
  return found ? found.label : "Vue d’ensemble"
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState("")
  const [currentDate, setCurrentDate] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDate(new Date())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const [modal, setModal] = useState(false)
  const [fleetOpen, setFleetOpen] = useState(() =>
    FLEET_NAV.some((item) => item.to === window.location.pathname),
  )
  const [rentalOpen, setRentalOpen] = useState(() =>
    RENTAL_NAV.some((item) => item.to === window.location.pathname),
  )

  const module = moduleFromPath(location.pathname)
  const subtitle = useMemo(
    () =>
      module === "Vue d’ensemble"
        ? "Voici la situation de l’activité aujourd’hui."
        : `Consultez et gérez les données du module ${module.toLowerCase()}.`,
    [module],
  )

  const showNewButton = ![
    "Vue d’ensemble",
    "Statistiques",
    "Catégories véhicules",
    "Modèle véhicule",
    "Garages",
    "Passages garage",
    "Réparations",
    "Mouvements véhicules",
    "Ventes de véhicules",
    "Prolongations",
  ].includes(module)
  const outletContext: DashboardOutletContext = useMemo(
    () => ({
      query,
      onAdd: () => setModal(true),
      onSeeLocations: () => navigate(ROUTES.locations),
    }),
    [query, navigate],
  )

  const handleLogout = () => {
    logout()
    navigate(ROUTES.home)
  }

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <Link to={ROUTES.home} aria-label="Hertz Bénin">
          <Logo light />
        </Link>
        <p className="nav-label">ESPACE DE GESTION</p>
        <nav>
          {NAV.map((item) => {
            const isActive =
              item.to === ROUTES.overview
                ? location.pathname === ROUTES.overview
                : location.pathname === item.to
            return (
              <button
                key={item.label}
                className={isActive ? "active" : ""}
                onClick={() => {
                  setQuery("")
                  navigate(item.to)
                }}
              >
                <Icon name={MODULE_ICONS[item.label]} />{" "}
                <span>{item.label}</span>
                {item.badge && <b>{item.badge}</b>}
              </button>
            )
          })}
          <div className="sidebar-group">
            <button
              className={RENTAL_NAV.some((item) => item.to === location.pathname) ? "active" : ""}
              aria-expanded={rentalOpen}
              aria-controls="rental-navigation"
              onClick={() => {
                setRentalOpen((open) => !open)
                if (!RENTAL_NAV.some((item) => item.to === location.pathname)) {
                  setQuery("")
                  navigate(ROUTES.locations)
                }
              }}
            >
              <Icon name="rental" /> <span>Gestion location</span>
              <span className="sidebar-chevron" aria-hidden="true">
                {rentalOpen ? "⌃" : "⌄"}
              </span>
            </button>
            {rentalOpen && (
              <div id="rental-navigation">
                {RENTAL_NAV.map((item) => (
                  <button
                    key={item.label}
                    className={location.pathname === item.to ? "active nested" : "nested"}
                    onClick={() => {
                      setQuery("")
                      navigate(item.to)
                    }}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="sidebar-group">
            <button
              className={FLEET_NAV.some((item) => item.to === location.pathname) ? "active" : ""}
              aria-expanded={fleetOpen}
              aria-controls="fleet-navigation"
              onClick={() => {
                setFleetOpen((open) => !open)
                if (!FLEET_NAV.some((item) => item.to === location.pathname)) {
                  setQuery("")
                  navigate(ROUTES.vehicules)
                }
              }}
            >
              <Icon name="car" /> <span>Parc automobile</span>
              <span className="sidebar-chevron" aria-hidden="true">
                {fleetOpen ? "⌃" : "⌄"}
              </span>
            </button>
            {fleetOpen && (
              <div id="fleet-navigation">
                {FLEET_NAV.map((item) => (
                  <button
                    key={item.label}
                    className={location.pathname === item.to ? "active nested" : "nested"}
                    onClick={() => {
                      setQuery("")
                      navigate(item.to)
                    }}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="sidebar-user">
          <span>{user?.initials ?? "KO"}</span>
          <div>
            <strong>{user?.name ?? "Koffi Orou"}</strong>
            <small>Responsable Hertz</small>
          </div>
          <button onClick={handleLogout} title="Déconnexion">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="dash-header">
          <label>
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans ce module…"
            />
          </label>
          <div>
            <button className="bell" aria-label="Notifications">
              <Icon name="bell" />
              <i />
            </button>
            <span className="dash-avatar">{user?.initials ?? "KO"}</span>
            <div>
              <strong>{user?.name ?? "Koffi Orou"}</strong>
              <small>Administrateur</small>
            </div>
          </div>
        </header>

        <div className="workspace-content">
          <div className="page-heading">
            <div>
              <p className="kicker">HERTZ BÉNIN · {formatCurrentDate(currentDate)}</p>
              <h1>{module}</h1>
              <p>{subtitle}</p>
            </div>
            {/* {showNewButton && (
              <button className="primary small" onClick={() => setModal(true)}>
                <Icon name="plus" size={17} /> Nouvel enregistrement
              </button>
            )} */}
          </div>
          <Outlet context={outletContext} />
        </div>
      </section>

      {modal && <AddModal module={module} close={() => setModal(false)} />}
    </main>
  )
}
