import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ReactNode } from "react"

import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"

import Icon from "@/shared/components/Icon"

import Logo from "@/shared/components/Logo"

import { MODULE_ICONS } from "@/shared/data/mockData"

import { ROUTES } from "@/app/routes"

import { useAuth } from "@/features/auth/AuthContext"

import { dashboardMutationEventName } from "@/shared/components/dashboardNotifications"

import {
  fetchDueActivityNotifications,
  fetchOverviewStats,
} from "@/shared/data/dashboardService"
import type { DueActivityNotification } from "@/shared/data/dashboardService"
import { gsap } from "gsap"

import AddModal from "./components/AddModal"
import ProfileModal from "./components/ProfileModal"

import type { DashboardModule } from "@/shared/data/types"

export interface DashboardOutletContext {
  query: string

  refreshKey: number

  pageTitle: DashboardModule

  pageDate: string

  pageSubtitle: string

  onAdd: () => void

  onSeeLocations: () => void

  setPageActions: (actions: ReactNode | null) => void
}

const NAV: Array<{
  label: DashboardModule

  to: string
}> = [
  { label: "Vue d’ensemble", to: ROUTES.overview },

  { label: "Agences", to: ROUTES.agences },

  { label: "Commerciaux", to: ROUTES.commerciaux },

  { label: "Réservations", to: ROUTES.reservations },

  { label: "Contraventions", to: ROUTES.contraventions },

  { label: "Centres", to: ROUTES.centres },

  { label: "Clients", to: ROUTES.clients },
  { label: "Conducteurs", to: ROUTES.conducteurs },

  { label: "Statistiques", to: ROUTES.statistiques },

  { label: "Administrateurs", to: ROUTES.administrateurs },
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

const DISMISSED_ACTIVITY_NOTIFICATIONS_KEY =
  "hertz-car-manager-dismissed-activity-notifications"

function readDismissedActivityNotificationIds(): Set<string> {
  try {
    const stored = window.localStorage.getItem(
      DISMISSED_ACTIVITY_NOTIFICATIONS_KEY,
    )
    if (!stored) return new Set()

    const parsed: unknown = JSON.parse(stored)
    if (
      Array.isArray(parsed) &&
      parsed.every((id): id is string => typeof id === "string")
    ) {
      return new Set(parsed)
    }

    console.error("Les notifications masquées enregistrées sont invalides.")
  } catch (error: unknown) {
    console.error("Impossible de lire les notifications masquées.", error)
  }

  return new Set()
}

function saveDismissedActivityNotificationIds(ids: Set<string>) {
  window.localStorage.setItem(
    DISMISSED_ACTIVITY_NOTIFICATIONS_KEY,
    JSON.stringify([...ids]),
  )
}

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
  const found = [...NAV, ...FLEET_NAV, ...RENTAL_NAV].find(
    (n) => n.to === pathname,
  )

  return found ? found.label : "Vue d’ensemble"
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()

  const navigate = useNavigate()

  const location = useLocation()

  const [query, setQuery] = useState("")

  const [currentDate, setCurrentDate] = useState(() => new Date())

  const [reservationsEnAttente, setReservationsEnAttente] =
    useState<number | null>(null)

  const [reservationCountError, setReservationCountError] =
    useState<string | null>(null)
  const [dueActivityNotifications, setDueActivityNotifications] = useState<
    DueActivityNotification[]
  >([])
  const dismissedActivityNotificationIds = useRef(
    readDismissedActivityNotificationIds(),
  )
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  )
  const [notificationPersistenceError, setNotificationPersistenceError] =
    useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const persistDismissedActivityNotifications = () => {
    try {
      saveDismissedActivityNotificationIds(
        dismissedActivityNotificationIds.current,
      )
      setNotificationPersistenceError(false)
    } catch (error: unknown) {
      console.error("Impossible d’enregistrer les notifications masquées.", error)
      setNotificationPersistenceError(true)
    }
  }

  const dismissNotification = (id: string) => {
    dismissedActivityNotificationIds.current.add(id)
    setDueActivityNotifications((notifications) =>
      notifications.filter((notification) => notification.id !== id),
    )
    persistDismissedActivityNotifications()
  }

  const dismissAllNotifications = () => {
    for (const notification of dueActivityNotifications) {
      dismissedActivityNotificationIds.current.add(notification.id)
    }
    setDueActivityNotifications([])
    persistDismissedActivityNotifications()
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDate(new Date())
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let toastTimer = 0

    const handleMutation = (event: Event) => {
      const message = (event as CustomEvent<string>).detail

      if (!message) return

      setSuccessMessage(message)

      window.clearTimeout(toastTimer)

      toastTimer = window.setTimeout(() => setSuccessMessage(""), 3000)
    }

    const eventName = dashboardMutationEventName()

    window.addEventListener(eventName, handleMutation)

    return () => {
      window.removeEventListener(eventName, handleMutation)

      window.clearTimeout(toastTimer)
    }
  }, [])

  useEffect(() => {
    let active = true

    const refreshReservationsCount = () => {
      void fetchOverviewStats()

        .then((stats) => {
          if (!active) return

          setReservationsEnAttente(stats.reservationsEnAttente)

          setReservationCountError(null)
        })

        .catch((error: unknown) => {
          if (!active) return

          setReservationsEnAttente(null)

          setReservationCountError(
            error instanceof Error
              ? error.message
              : "Nombre de réservations indisponible",
          )
        })
    }

    const handleMutation = () => refreshReservationsCount()

    window.addEventListener(dashboardMutationEventName(), handleMutation)

    refreshReservationsCount()

    return () => {
      active = false

      window.removeEventListener(dashboardMutationEventName(), handleMutation)
    }
  }, [location.pathname])

  useEffect(() => {
    let active = true

    const refreshNotifications = async () => {
      try {
        const notifications = await fetchDueActivityNotifications()
        if (!active) return

        const activeNotificationIds = new Set(
          notifications.map((notification) => notification.id),
        )
        let removedStaleDismissals = false
        for (const id of dismissedActivityNotificationIds.current) {
          if (!activeNotificationIds.has(id)) {
            dismissedActivityNotificationIds.current.delete(id)
            removedStaleDismissals = true
          }
        }
        if (removedStaleDismissals) {
          persistDismissedActivityNotifications()
        }

        setDueActivityNotifications(
          notifications.filter(
            (notification) =>
              !dismissedActivityNotificationIds.current.has(notification.id),
          ),
        )
        setNotificationError(null)
      } catch (error: unknown) {
        if (!active) return

        setNotificationError(
          error instanceof Error
            ? error.message
            : "Les notifications sont indisponibles.",
        )
      } finally {
        if (active) setNotificationsLoading(false)
      }
    }

    const refresh = () => void refreshNotifications()
    const eventName = dashboardMutationEventName()
    const timer = window.setInterval(refresh, 60_000)

    window.addEventListener(eventName, refresh)
    window.addEventListener("focus", refresh)
    refresh()

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener(eventName, refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const [modal, setModal] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  const [successMessage, setSuccessMessage] = useState("")

  const [pageActions, setPageActions] = useState<ReactNode | null>(null)

  const [fleetOpen, setFleetOpen] = useState(() =>
    FLEET_NAV.some((item) => item.to === window.location.pathname),
  )

  const [rentalOpen, setRentalOpen] = useState(() =>
    RENTAL_NAV.some((item) => item.to === window.location.pathname),
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const module = moduleFromPath(location.pathname)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (
      !content ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return

    const elements = content.querySelectorAll(
      ".page-heading, .data-card, .dashboard-grid, .stats-grid, .report-card",
    )
    if (!elements.length) return

    const context = gsap.context(() => {
      gsap.fromTo(elements, { autoAlpha: 0, y: 18 }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.07,
        ease: "power2.out",
        clearProps: "transform",
      })
    }, content)

    return () => context.revert()
  }, [location.pathname])

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
    "Administrateurs",
  ].includes(module)

  const outletContext: DashboardOutletContext = useMemo(
    () => ({
      query,

      refreshKey,

      pageTitle: module,

      pageDate: formatCurrentDate(currentDate),

      pageSubtitle: subtitle,

      onAdd: () => setModal(true),

      onSeeLocations: () => navigate(ROUTES.locations),

      setPageActions,
    }),

    [query, refreshKey, module, currentDate, subtitle, navigate],
  )

  const handleLogout = () => {
    logout()
    navigate(ROUTES.home)
  }

  return (
    <main className="dashboard">
      {mobileNavOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <Link
            to={ROUTES.home}
            aria-label="Hertz Bénin"
            onClick={() => setMobileNavOpen(false)}
          >
            <Logo light />
          </Link>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Fermer la navigation"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="nav-label">ESPACE DE GESTION</p>
        <nav>
          {NAV.filter(
            (item) =>
              item.label !== "Administrateurs" ||
              user?.role === "superadmin",
          ).map((item) => {
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
                  setMobileNavOpen(false)
                  navigate(item.to)
                }}
              >
                <Icon name={MODULE_ICONS[item.label]} />{" "}
                <span>{item.label}</span>
                {item.label === "Réservations" &&
                  reservationsEnAttente !== null && (
                    <b
                      aria-label={`${reservationsEnAttente} réservations en attente`}
                    >
                      {reservationsEnAttente}
                    </b>
                  )}
                {item.label === "Réservations" && reservationCountError && (
                  <b
                    title={reservationCountError}
                    aria-label="Nombre de réservations indisponible"
                  >
                    !
                  </b>
                )}
              </button>
            )
          })}
          <div className="sidebar-group">
            <button
              className={
                RENTAL_NAV.some((item) => item.to === location.pathname)
                  ? "active"
                  : ""
              }
              aria-expanded={rentalOpen}
              aria-controls="rental-navigation"
              onClick={() => {
                setRentalOpen((open) => !open)

                if (!RENTAL_NAV.some((item) => item.to === location.pathname)) {
                  setQuery("")
                  setMobileNavOpen(false)
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
                    className={
                      location.pathname === item.to ? "active nested" : "nested"
                    }
                    onClick={() => {
                      setQuery("")
                      setMobileNavOpen(false)
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
              className={
                FLEET_NAV.some((item) => item.to === location.pathname)
                  ? "active"
                  : ""
              }
              aria-expanded={fleetOpen}
              aria-controls="fleet-navigation"
              onClick={() => {
                setFleetOpen((open) => !open)

                if (!FLEET_NAV.some((item) => item.to === location.pathname)) {
                  setQuery("")
                  setMobileNavOpen(false)
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
                    className={
                      location.pathname === item.to ? "active nested" : "nested"
                    }
                    onClick={() => {
                      setQuery("")
                      setMobileNavOpen(false)
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
          <span>{user?.initials ?? "AD"}</span>
          <div>
            <strong>{user?.name ?? "Administrateur"}</strong>
            <small>{user?.roleLabel ?? "Responsable Hertz"}</small>
          </div>
          <button
            onClick={() => setLogoutConfirmationOpen(true)}
            title="Déconnexion"
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        {successMessage && (
          <div className="dashboard-success-toast" role="status">
            {successMessage}
          </div>
        )}
        <header className="dash-header">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label={mobileNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            <Icon name={mobileNavOpen ? "close" : "menu"} size={20} />
          </button>
          <label>
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans ce module…"
            />
          </label>
          <div>
            <div className="notification-area">
              <button
                className="bell"
                type="button"
                aria-label={`Notifications : ${dueActivityNotifications.length}`}
                aria-expanded={notificationsOpen}
                aria-controls="due-notifications-panel"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" />
                {dueActivityNotifications.length > 0 && (
                  <span className="notification-count">
                    {dueActivityNotifications.length > 99
                      ? "99+"
                      : dueActivityNotifications.length}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  className="notification-panel"
                  id="due-notifications-panel"
                  aria-label="Notifications d’échéance"
                >
                  <div className="notification-panel-header">
                    <strong>Échéances arrivées</strong>
                    <span>{dueActivityNotifications.length}</span>
                    {dueActivityNotifications.length > 0 && (
                      <button
                        className="notification-dismiss-all"
                        type="button"
                        onClick={dismissAllNotifications}
                      >
                        Tout supprimer
                      </button>
                    )}
                  </div>
                  {notificationError && (
                    <p className="notification-panel-error" role="alert">
                      Impossible de charger les notifications :{" "}
                      {notificationError}
                    </p>
                  )}
                  {notificationPersistenceError && (
                    <p className="notification-panel-error" role="alert">
                      Les notifications sont masquées jusqu’au rechargement,
                      mais leur suppression n’a pas pu être mémorisée.
                    </p>
                  )}
                  {notificationsLoading ? (
                    <p className="notification-panel-empty">
                      Chargement des échéances…
                    </p>
                  ) : dueActivityNotifications.length === 0 ? (
                    <p className="notification-panel-empty">
                      Aucune échéance n’est arrivée.
                    </p>
                  ) : (
                    <ul>
                      {dueActivityNotifications.map((notification) => (
                        <li key={notification.id}>
                          <button
                            className="notification-dismiss"
                            type="button"
                            aria-label={`Supprimer : ${notification.message}`}
                            title="Supprimer cette notification"
                            onClick={() =>
                              dismissNotification(notification.id)
                            }
                          >
                            <Icon name="trash" size={15} />
                          </button>
                          <div className="notification-content">
                            <p>{notification.message}</p>
                            <small>
                              Échéance : {notification.deadlineLabel}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
            <button
              className="header-profile"
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label="Modifier mon profil"
              title="Modifier mon profil"
            >
              <span className="dash-avatar">{user?.initials ?? "AD"}</span>
              <div>
                <strong>{user?.name ?? "Administrateur"}</strong>
                <small>{user?.roleLabel ?? "Administrateur"}</small>
              </div>
            </button>
          </div>
        </header>

        <div className="workspace-content" ref={contentRef}>
          {module !== "Véhicules" && (
            <div
              className={
                module === "Locations"
                  ? "page-heading locations-page-heading"
                  : module === "Réservations"
                    ? "page-heading vehicle-page-heading reservation-page-heading"
                    : module === "Contraventions"
                      ? "page-heading contravention-page-heading"
                      : "page-heading"
              }
            >
              <div>
                <p className="kicker">
                  HERTZ BÉNIN · {formatCurrentDate(currentDate)}
                </p>
                <h1>{module}</h1>
                <p>{subtitle}</p>
              </div>
              {module === "Locations" && pageActions}
              {module === "Réservations" && pageActions}
              {module === "Contraventions" && pageActions}
              {module === "Agences" && pageActions}
              {module === "Centres" && pageActions}
              {module === "Clients" && pageActions}
              {module === "Commerciaux" && pageActions}
              {module === "Conducteurs" && pageActions}
              {/* {showNewButton && (
                <button className="primary small" onClick={() => setModal(true)}>
                  <Icon name="plus" size={17} /> Nouvel enregistrement
                </button>
              )} */}
            </div>
          )}
          <Outlet context={outletContext} />
        </div>
      </section>

      {modal && (
        <AddModal
          module={module}
          close={() => setModal(false)}
          onCreated={() => setRefreshKey((current) => current + 1)}
        />
      )}
      {profileOpen && (
        <ProfileModal
          close={() => setProfileOpen(false)}
          saved={() => {
            setProfileOpen(false)
            setSuccessMessage("Profil mis à jour avec succès.")
          }}
        />
      )}
      {logoutConfirmationOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setLogoutConfirmationOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirmation-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setLogoutConfirmationOpen(false)}
              aria-label="Fermer"
            >
              <Icon name="close" />
            </button>
            <p className="kicker">DÉCONNEXION</p>
            <h2 id="logout-confirmation-title">Confirmer la déconnexion ?</h2>
            <p>Votre session sera fermée sur cet appareil.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setLogoutConfirmationOpen(false)}
              >
                Annuler
              </button>
              <button type="button" className="primary small" onClick={handleLogout}>
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
