import { useMemo, useState } from "react"
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
  refreshKey: number
  onAdd: () => void
  onClientCreated: () => void
  onSeeLocations: () => void
}

const NAV: Array<{
  label: DashboardModule
  to: string
  badge?: string
}> = [
  { label: "Vue d’ensemble", to: ROUTES.overview },
  { label: "Commerciaux", to: ROUTES.commerciaux },
  { label: "Véhicules", to: ROUTES.vehicules },
  { label: "Locations", to: ROUTES.locations },
  { label: "Réservations", to: ROUTES.reservations, badge: "7" },
  { label: "Clients", to: ROUTES.clients },
  { label: "Statistiques", to: ROUTES.statistiques },
]

function moduleFromPath(pathname: string): DashboardModule {
  const found = NAV.find((n) => n.to === pathname)
  return found ? found.label : "Vue d’ensemble"
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState("")
  const [modal, setModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const module = moduleFromPath(location.pathname)
  const subtitle = useMemo(
    () =>
      module === "Vue d’ensemble"
        ? "Voici la situation de l’activité aujourd’hui."
        : `Consultez et gérez les données du module ${module.toLowerCase()}.`,
    [module],
  )

  const showNewButton = !["Vue d’ensemble", "Statistiques"].includes(module)
  const outletContext: DashboardOutletContext = useMemo(
    () => ({
      query,
      refreshKey,
      onAdd: () => setModal(true),
      onClientCreated: () => setRefreshKey((current) => current + 1),
      onSeeLocations: () => navigate(ROUTES.locations),
    }),
    [query, refreshKey, navigate],
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
              <p className="kicker">HERTZ BÉNIN · 18 JUIN 2026</p>
              <h1>{module}</h1>
              <p>{subtitle}</p>
            </div>
            {showNewButton && (
              <button className="primary small" onClick={() => setModal(true)}>
                <Icon name="plus" size={17} /> Nouvel enregistrement
              </button>
            )}
          </div>
          <Outlet context={outletContext} />
        </div>
      </section>

      {modal && (
        <AddModal
          module={module}
          close={() => setModal(false)}
          onCreated={outletContext.onClientCreated}
        />
      )}
    </main>
  )
}
