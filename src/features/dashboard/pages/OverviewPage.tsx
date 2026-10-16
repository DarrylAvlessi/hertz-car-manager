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

export default function OverviewPage({ onSeeLocations }: { onSeeLocations: () => void }) {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recent, setRecent] = useState<TableResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <section className="data-card">
        <p className="p-4 text-sm text-neutral-500">Chargement de l’activité…</p>
      </section>
    )
  }

  const partDisponible = Math.round((stats.vehiculesDisponibles / Math.max(1, stats.vehiculesTotal)) * 100)
  const cards: Array<[string, string, string, string, string]> = [
    ["Chiffre d’affaires", formatCompactMillions(stats.caTotal), stats.devise, stats.caCroissance, "stats"],
    ["Véhicules disponibles", String(stats.vehiculesDisponibles), `sur ${stats.vehiculesTotal}`, `${partDisponible}% du parc`, "car"],
    ["Locations actives", String(stats.locationsActives), "contrats", "+3 aujourd’hui", "rental"],
    ["Réservations en attente", String(stats.reservationsEnAttente), "demandes", "2 prioritaires", "booking"],
  ]

  return (
    <>
      <section className="stats-grid">
        {cards.map(([label, value, unit, trend, icon]) => (
          <article key={label}>
            <div className="stat-icon">
              <Icon name={icon} />
            </div>
            <p>{label}</p>
            <strong>
              {value} <small>{unit}</small>
            </strong>
            <span>{trend}</span>
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
                <div key={DAYS[i]}>
                  <i style={{ height: `${h}%` }} />
                  <span>{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
        <article className="fleet-widget">
          <WidgetTitle title="État de la flotte" subtitle={`${stats.vehiculesTotal} véhicules au total`} />
          <div className="donut">
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
      </section>
    </>
  )
}
