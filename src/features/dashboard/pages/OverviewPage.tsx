import Icon from "@/shared/components/Icon"
import StatusBadge from "@/shared/components/StatusBadge"
import WidgetTitle from "@/shared/components/WidgetTitle"
import { getRecentLocations } from "@/shared/data/dashboardService"

const STATS: Array<[string, string, string, string, string]> = [
  ["Chiffre d’affaires", "18,4 M", "FCFA", "+12,6%", "stats"],
  ["Véhicules disponibles", "38", "sur 64", "59% du parc", "car"],
  ["Locations actives", "24", "contrats", "+3 aujourd’hui", "rental"],
  ["Réservations en attente", "7", "demandes", "2 prioritaires", "booking"],
]

const DAYS = ["Jeu", "Ven", "Sam", "Dim", "Lun", "Mar", "Mer"]
const BARS = [42, 62, 48, 78, 55, 91, 72]

export default function OverviewPage({
  onSeeLocations,
}: {
  onSeeLocations: () => void
}) {
  return (
    <>
      <section className="stats-grid">
        {STATS.map(([label, value, unit, trend, icon]) => (
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
          <WidgetTitle
            title="État de la flotte"
            subtitle="64 véhicules au total"
          />
          <div className="donut">
            <div>
              <strong>59%</strong>
              <span>disponibles</span>
            </div>
          </div>
          <div className="legend">
            <p>
              <i className="l1" />
              Disponibles <strong>38</strong>
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
            {getRecentLocations().map((r) => (
              <tr key={r[0]}>
                <td>
                  <strong>{r[0]}</strong>
                </td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
                <td>{r[4]}</td>
                <td>
                  <StatusBadge value={r[5]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
