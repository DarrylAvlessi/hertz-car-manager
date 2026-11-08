import { useEffect, useState } from "react"
import Icon from "@/shared/components/Icon"
import StatusBadge from "@/shared/components/StatusBadge"
import WidgetTitle from "@/shared/components/WidgetTitle"
import {
  fetchOverviewStats,
  fetchRecentLocations,
  formatCompactMillions,
  type OverviewStats,
  type TableResult,
} from "@/shared/data/dashboardService"

const DAYS = ["Jeu", "Ven", "Sam", "Dim", "Lun", "Mar", "Mer"]
const BARS = [42, 62, 48, 78, 55, 91, 72]
const AMOUNTS = ["420k", "620k", "480k", "780k", "550k", "910k", "720k"]

export default function OverviewPage({ onSeeLocations }: { onSeeLocations: () => void }) {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recent, setRecent] = useState<TableResult | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  const cards: Array<{
    label: string
    value: string
    unit: string
    trend: string
    icon: string
    positive?: boolean
  }> = [
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

  return (
    <>
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
            title="Évolution du chiffre d’affaires"
            subtitle="Revenus des 7 derniers jours"
            action="7 jours"
          />
          <div className="chart">
            <div className="chart-y">
              <span>600k</span>
              <span>400k</span>
              <span>200k</span>
              <span>0</span>
            </div>
            <div className="chart-bars">
              {BARS.map((h, i) => (
                <div
                  key={DAYS[i]}
                  className="chart-bar-item"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {hoveredBar === i && (
                    <div className="chart-tooltip" role="tooltip">
                      <strong>{AMOUNTS[i]}</strong>
                    </div>
                  )}
                  <i style={{ height: `${h}%` }} />
                  <span>{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
        <article className="fleet-widget">
          <WidgetTitle title="État de la flotte" subtitle={`${stats.vehiculesTotal} véhicules au total`} />
          <div className="donut" title={`${partDisponible}% de véhicules disponibles`}>
            <div>
              <strong>{partDisponible}%</strong>
              <span>disponibles</span>
            </div>
          </div>
          <div className="legend">
            <p>
              <i className="l1" />
              Disponibles <strong>{stats.vehiculesDisponibles}</strong>
            </p>
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
          </div>
        </article>
      </section>
      <section className="recent">
        <WidgetTitle
          title="Activité récente"
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
              {recent.rows.map((r) => (
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
