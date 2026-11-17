import { useEffect, useState } from "react"
import { apiFetch } from "@/shared/api/client"
import Icon from "@/shared/components/Icon"
import StatusBadge from "@/shared/components/StatusBadge"
import WidgetTitle from "@/shared/components/WidgetTitle"
import {
  fetchOverviewStats,
  fetchRecentLocations,
  formatCompactMillions,
  formatMontant,
  type OverviewStats,
  type TableResult,
} from "@/shared/data/dashboardService"

const DAYS = ["Jeu", "Ven", "Sam", "Dim", "Lun", "Mar", "Mer"]
const BARS = [42, 62, 48, 78, 55, 91, 72]
const AMOUNTS = ["420k", "620k", "480k", "780k", "550k", "910k", "720k"]
const ACTIVE_RENTAL_STATUSES = ["EN_COURS", "EN_RETARD", "EN_PROLONGATION"]

interface DashboardLocation {
  id: number
  reference: string
  client: string
  vehicule: string
  vehiculeSousLocationId?: number | null
  isSousLocation?: boolean
  dateDebut?: string
  dateFin: string
  montant?: number
  statut: string
}

interface SubLocationVehicle {
  id: number
  immatriculation: string
}

interface SubLocationDashboardData {
  locations: DashboardLocation[]
  vehicles: SubLocationVehicle[]
}

function dayKey(value: string): string {
  return value.slice(0, 10)
}

export default function OverviewPage({ onSeeLocations }: { onSeeLocations: () => void }) {
  const [scope, setScope] = useState<"parc" | "sous-location">("parc")
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recent, setRecent] = useState<TableResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subData, setSubData] = useState<SubLocationDashboardData | null>(null)
  const [subError, setSubError] = useState<string | null>(null)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchOverviewStats(), fetchRecentLocations(3)])
      .then(([s, r]) => {
        if (!alive) return
        setStats(s)
        setRecent(r)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible")
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (scope !== "sous-location") return
    let alive = true
    Promise.all([
      apiFetch<DashboardLocation[]>("/api/locations"),
      apiFetch<SubLocationVehicle[]>("/api/sous-locations/vehicules"),
    ])
      .then(([locations, vehicles]) => {
        if (!alive) return
        setSubData({
          locations: locations.filter((location) => location.isSousLocation),
          vehicles,
        })
        setSubError(null)
      })
      .catch((cause: unknown) => {
        if (alive) {
          setSubError(
            cause instanceof Error ? cause.message : "Chargement impossible",
          )
        }
      })
    return () => {
      alive = false
    }
  }, [scope])

  if (error) {
    return (
      <section className="data-card">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Chargement impossible :</strong> {error}
        </div>
      </section>
    )
  }

  if (!stats || !recent) {
    return (
      <div className="overview-loading-skeleton" aria-busy="true" aria-label="Chargement">
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <article key={i} className="skeleton" style={{ minHeight: 142 }} />
          ))}
        </div>
        <div className="dashboard-grid">
          <article className="skeleton" style={{ minHeight: 320 }} />
          <article className="skeleton" style={{ minHeight: 320 }} />
        </div>
      </div>
    )
  }

  const partDisponible = Math.round((stats.vehiculesDisponibles / Math.max(1, stats.vehiculesTotal)) * 100)
  const subLocations = subData?.locations ?? []
  const activeSubLocations = subLocations.filter((location) =>
    ACTIVE_RENTAL_STATUSES.includes(location.statut),
  )
  const rentedSubVehicleIds = new Set(
    activeSubLocations
      .map((location) => location.vehiculeSousLocationId)
      .filter((id): id is number => id != null),
  )
  const subVehicleCount = subData?.vehicles.length ?? 0
  const subAvailableCount = Math.max(0, subVehicleCount - rentedSubVehicleIds.size)
  const subAvailability = subVehicleCount
    ? Math.round((subAvailableCount / subVehicleCount) * 100)
    : 0
  const subRevenue = subLocations.reduce(
    (total, location) => total + (location.montant ?? 0),
    0,
  )
  const subRecentRows = [...subLocations]
    .sort((a, b) => (b.dateDebut ?? "").localeCompare(a.dateDebut ?? ""))
    .slice(0, 3)
  const subRevenueByDate = (() => {
    const values = new Map<string, number>()
    const today = new Date()
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - offset,
      )
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
      values.set(key, 0)
    }
    for (const location of subData?.locations ?? []) {
      const key = location.dateDebut ? dayKey(location.dateDebut) : ""
      if (values.has(key)) {
        values.set(key, values.get(key)! + (location.montant ?? 0))
      }
    }
    return [...values.entries()].map(([key, amount]) => {
      const [year, month, day] = key.split("-").map(Number)
      return {
        label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
          .format(new Date(year, month - 1, day))
          .replace(".", ""),
        amount,
      }
    })
  })()
  const maxSubRevenue = Math.max(...subRevenueByDate.map(({ amount }) => amount), 0)
  const cards: Array<{
    label: string
    value: string
    unit: string
    trend: string
    icon: string
    positive?: boolean
  }> = scope === "sous-location"
    ? [
        {
          label: "Chiffre d’affaires sous-locations",
          value: subData ? formatCompactMillions(subRevenue) : "…",
          unit: "F CFA",
          trend: `${subLocations.length} contrats enregistrés`,
          icon: "stats",
          positive: true,
        },
        {
          label: "Véhicules de sous-location",
          value: subData ? String(subVehicleCount) : "…",
          unit: "véhicules",
          trend: "hors parc automobile",
          icon: "car",
          positive: true,
        },
        {
          label: "Sous-locations actives",
          value: subData ? String(activeSubLocations.length) : "…",
          unit: "contrats",
          trend: "en cours ou en retard",
          icon: "rental",
          positive: true,
        },
        {
          label: "Véhicules disponibles",
          value: subData ? String(subAvailableCount) : "…",
          unit: `sur ${subVehicleCount}`,
          trend: `${subAvailability}% des véhicules sous-loués`,
          icon: "booking",
          positive: subAvailability >= 50,
        },
      ]
    : [
    {
      label: "Chiffre d’affaires",
      value: formatCompactMillions(stats.caTotal),
      unit: stats.devise,
      trend: stats.caCroissance,
      icon: "stats",
      positive: true,
    },
    {
      label: "Véhicules disponibles",
      value: String(stats.vehiculesDisponibles),
      unit: `sur ${stats.vehiculesTotal}`,
      trend: `${partDisponible}% du parc`,
      icon: "car",
      positive: partDisponible >= 50,
    },
    {
      label: "Locations actives",
      value: String(stats.locationsActives),
      unit: "contrats",
      trend: "+3 aujourd’hui",
      icon: "rental",
      positive: true,
    },
    {
      label: "Réservations en attente",
      value: String(stats.reservationsEnAttente),
      unit: "demandes",
      trend: "2 prioritaires",
      icon: "booking",
      positive: false,
    },
      ]

  const chartBars =
    scope === "sous-location"
      ? subRevenueByDate.map(({ label, amount }) => ({
          label,
          height: maxSubRevenue
            ? Math.max(4, (amount / maxSubRevenue) * 100)
            : 0,
          amount: formatMontant(amount),
        }))
      : BARS.map((height, index) => ({
          label: DAYS[index]!,
          height,
          amount: AMOUNTS[index]!,
        }))

  return (
    <>
      <div className="mb-4 flex justify-end">
        <select
          className="secondary status-filter"
          aria-label="Périmètre des indicateurs du tableau de bord"
          value={scope}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === "parc" || value === "sous-location") setScope(value)
          }}
        >
          <option value="parc">Indicateurs du parc</option>
          <option value="sous-location">Indicateurs des sous-locations</option>
        </select>
      </div>
      <section className="stats-grid">
        {cards.map(({ label, value, unit, trend, icon, positive }) => (
          <article key={label} className="overview-kpi-card">
            <div className="stat-icon">
              <Icon name={icon} />
            </div>
            <p>{label}</p>
            <strong>
              {value} <small>{unit}</small>
            </strong>
            <span className={positive ? "kpi-trend positive" : "kpi-trend"}>
              <i className="trend-arrow">{positive ? "↑" : "•"}</i> {trend}
            </span>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="revenue-widget">
          <WidgetTitle
            title={
              scope === "sous-location"
                ? "Chiffre d’affaires des sous-locations"
                : "Évolution du chiffre d’affaires"
            }
            subtitle="Revenus des 7 derniers jours"
            action="7 jours"
          />
          {scope === "sous-location" && subError ? (
            <p className="p-4 text-sm text-red-700">
              Chargement des sous-locations impossible : {subError}
            </p>
          ) : (
          <div className="chart">
            <div className="chart-y">
              {scope === "sous-location"
                ? [1, 0.66, 0.33, 0].map((ratio) => (
                    <span key={ratio}>
                      {ratio === 0
                        ? "0"
                        : `${Math.round((maxSubRevenue * ratio) / 1000)}k`}
                    </span>
                  ))
                : ["600k", "400k", "200k", "0"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
            </div>
            <div className="chart-bars">
              {chartBars.map((bar, i) => (
                <div
                  key={bar.label}
                  className="chart-bar-item"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {hoveredBar === i && (
                    <div className="chart-tooltip" role="tooltip">
                      <strong>{bar.amount}</strong>
                    </div>
                  )}
                  <i style={{ height: `${bar.height}%` }} />
                  <span>{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </article>
        <article className="fleet-widget">
          <WidgetTitle
            title={scope === "sous-location" ? "État des véhicules sous-loués" : "État de la flotte"}
            subtitle={
              scope === "sous-location"
                ? `${subVehicleCount} véhicules référencés`
                : `${stats.vehiculesTotal} véhicules au total`
            }
          />
          <div
            className="donut"
            title={
              scope === "sous-location"
                ? `${subAvailability}% de véhicules disponibles`
                : `${partDisponible}% de véhicules disponibles`
            }
          >
            <div>
              <strong>{scope === "sous-location" ? subAvailability : partDisponible}%</strong>
              <span>disponibles</span>
            </div>
          </div>
          <div className="legend">
            <p>
              <i className="l1" />
              Disponibles <strong>{scope === "sous-location" ? subAvailableCount : stats.vehiculesDisponibles}</strong>
            </p>
            {scope === "sous-location" ? (
              <p>
                <i className="l2" />
                En location <strong>{rentedSubVehicleIds.size}</strong>
              </p>
            ) : (
              <>
                <p>
                  <i className="l2" />
                  En location <strong>19</strong>
                </p>
                <p>
                  <i className="l3" />
                  En entretien <strong>5</strong>
                </p>
                <p>
                  <i className="l4" />
                  Indisponibles <strong>2</strong>
                </p>
              </>
            )}
          </div>
        </article>
      </section>
      <section className="recent">
        <WidgetTitle
          title={scope === "sous-location" ? "Sous-locations récentes" : "Activité récente"}
          subtitle="Dernières opérations enregistrées"
          action="Voir les locations"
          onAction={onSeeLocations}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Opération</th>
                <th>Client</th>
                <th>Véhicule</th>
                <th>Échéance</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {(scope === "sous-location"
                ? subRecentRows.map((location) => [
                    location.reference,
                    location.client,
                    location.vehicule,
                    location.dateFin
                      ? dayKey(location.dateFin).split("-").reverse().join("/")
                      : "—",
                    location.statut,
                  ])
                : recent.rows
              ).map((r) => (
                <tr key={r[0]}>
                  <td>
                    <strong>{r[0]}</strong>
                  </td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>
                    <StatusBadge value={r[4]!} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
