import WidgetTitle from "@/shared/components/WidgetTitle"

const MONTHS: Array<[string, number, number]> = [
  ["Jan", 45, 26],
  ["Fév", 52, 31],
  ["Mar", 65, 38],
  ["Avr", 58, 42],
  ["Mai", 78, 48],
  ["Juin", 88, 56],
]

export default function StatisticsPage() {
  return (
    <>
      <section className="stats-grid report-stats">
        <article>
          <p>CA mensuel</p>
          <strong>
            18,4 M <small>FCFA</small>
          </strong>
          <span>Objectif atteint à 92%</span>
        </article>
        <article>
          <p>Taux d’utilisation</p>
          <strong>
            71,8 <small>%</small>
          </strong>
          <span>+4,2 pts ce mois</span>
        </article>
        <article>
          <p>Taux de rotation</p>
          <strong>
            3,4 <small>locations/véhicule</small>
          </strong>
          <span>Dans la cible</span>
        </article>
        <article>
          <p>Réservations abouties</p>
          <strong>
            84 <small>%</small>
          </strong>
          <span>126 sur 150</span>
        </article>
      </section>
      <section className="report-card">
        <WidgetTitle
          title="Performance mensuelle"
          subtitle="Comparatif locations courte et longue durée"
          action="Exporter le rapport"
        />
        <div className="big-bars">
          {MONTHS.map(([m, short, long]) => (
            <div key={m}>
              <span>{m}</span>
              <i className="short" style={{ height: `${short}%` }} />
              <i className="long" style={{ height: `${long}%` }} />
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
