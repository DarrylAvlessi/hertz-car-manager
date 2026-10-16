import { useEffect, useState } from "react"
import WidgetTitle from "@/shared/components/WidgetTitle"
import { exportUrl } from "@/shared/api/client"
import {
  fetchMonthly,
  fetchOverviewStats,
  formatCompactMillions,
  formatFr1,
  type MonthlyPoint,
  type OverviewStats,
} from "@/shared/data/dashboardService"

export default function StatisticsPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchOverviewStats(), fetchMonthly()])
      .then(([s, m]) => {
        if (!alive) return
        setStats(s)
        setMonthly(m)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible")
      })
    return () => {
      alive = false
    }
  }, [])

  const exportRapport = (): void => {
    window.open(exportUrl("/api/export/rapports/activite"), "_blank", "noopener")
  }

  if (error) {
    return (
      <section className="data-card">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Chargement impossible :</strong> {error}
        </div>
      </section>
    )
  }

  if (!stats || !monthly) {
    return (
      <section className="data-card">
        <p className="p-4 text-sm text-neutral-500">Chargement des statistiques…</p>
      </section>
    )
  }

  const pctAbouties =
    stats.reservationsTotal > 0
      ? Math.round((stats.reservationsAbouties / stats.reservationsTotal) * 100)
      : 0
  const maxBar = Math.max(1, ...monthly.flatMap((m) => [m.courte, m.longue]))

  return (
    <>
      <section className="stats-grid report-stats">
        <article>
          <p>CA mensuel</p>
          <strong>
            {formatCompactMillions(stats.caTotal)} <small>{stats.devise}</small>
          </strong>
          <span>Objectif atteint à 92%</span>
        </article>
        <article>
          <p>Taux d’utilisation</p>
          <strong>
            {formatFr1(stats.tauxUtilisation)} <small>%</small>
          </strong>
          <span>+4,2 pts ce mois</span>
        </article>
        <article>
          <p>Taux de rotation</p>
          <strong>
            {formatFr1(stats.tauxRotation)} <small>locations/véhicule</small>
          </strong>
          <span>Dans la cible</span>
        </article>
        <article>
          <p>Réservations abouties</p>
          <strong>
            {pctAbouties} <small>%</small>
          </strong>
          <span>
            {stats.reservationsAbouties} sur {stats.reservationsTotal}
          </span>
        </article>
      </section>
      <section className="report-card">
        <WidgetTitle
          title="Performance mensuelle"
          subtitle="Comparatif locations courte et longue durée"
          action="Exporter le rapport"
          onAction={exportRapport}
        />
        <div className="big-bars">
          {monthly.map((m) => (
            <div key={m.mois}>
              <span>{m.mois}</span>
              <i className="short" style={{ height: `${Math.round((m.courte / maxBar) * 100)}%` }} />
              <i className="long" style={{ height: `${Math.round((m.longue / maxBar) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="report-legend">
          <span>
            <i />
            Courte durée
          </span>
          <span>
            <i />
            Longue durée
          </span>
        </div>
      </section>
    </>
  )
}
