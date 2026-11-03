import { useEffect, useState } from "react"
import WidgetTitle from "@/shared/components/WidgetTitle"
import DatePeriodFilter, {
  type DatePeriod,
} from "@/features/dashboard/components/DatePeriodFilter"
import { exportUrl } from "@/shared/api/client"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts"
import {
  fetchCommerciauxFiches,
  fetchDailyStats,
  fetchFleetStatus,
  fetchMonthly,
  fetchOverviewStats,
  formatCompactMillions,
  formatFr1,
  formatMontant,
  type CommercialFicheDto,
  type DailyStat,
  type FleetStatus,
  type MonthlyPoint,
  type OverviewStats,
} from "@/shared/data/dashboardService"

const COLORS = [
  "#FFB020",
  "#2D6A4F",
  "#1B263B",
  "#4A90E2",
  "#D00000",
  "#7B61FF",
]

function periodBounds(period: DatePeriod): { debut?: string; fin?: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)

  switch (period) {
    case "day": {
      const d = startOfDay(now)
      return { debut: iso(d), fin: iso(endOfDay(now)) }
    }
    case "week": {
      const monday = startOfDay(now)
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return { debut: iso(monday), fin: iso(endOfDay(sunday)) }
    }
    case "month": {
      const debut = new Date(now.getFullYear(), now.getMonth(), 1)
      const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { debut: iso(debut), fin: iso(endOfDay(fin)) }
    }
    case "year": {
      const debut = new Date(now.getFullYear(), 0, 1)
      const fin = new Date(now.getFullYear(), 11, 31)
      return { debut: iso(debut), fin: iso(endOfDay(fin)) }
    }
    default:
      return {}
  }
}

export default function StatisticsPage() {
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")
  const { debut, fin } = periodBounds(datePeriod)
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyPoint[] | null>(null)
  const [commerciaux, setCommerciaux] = useState<CommercialFicheDto[] | null>(
    null,
  )
  const [daily, setDaily] = useState<DailyStat[] | null>(null)
  const [fleet, setFleet] = useState<FleetStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchOverviewStats(debut, fin),
      fetchMonthly(debut, fin),
      fetchCommerciauxFiches(),
      fetchDailyStats(debut, fin),
      fetchFleetStatus(),
    ])
      .then(([s, m, c, d, f]) => {
        if (!alive) return
        setStats(s)
        setMonthly(m)
        setCommerciaux(c)
        setDaily(d)
        setFleet(f)
      })
      .catch((e: unknown) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Chargement impossible")
      })
    return () => {
      alive = false
    }
  }, [datePeriod, debut, fin])

  const exportRapport = (): void => {
    window.open(
      exportUrl("/api/export/rapports/activite"),
      "_blank",
      "noopener",
    )
  }

  const printPage = (): void => {
    window.print()
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

  if (!stats || !monthly || !daily || !fleet) {
    return (
      <section className="data-card">
        <p className="p-4 text-sm text-neutral-500">
          Chargement des statistiques…
        </p>
      </section>
    )
  }

  const pctAbouties =
    stats.reservationsTotal > 0
      ? Math.round((stats.reservationsAbouties / stats.reservationsTotal) * 100)
      : 0
  const maxBar = Math.max(1, ...monthly.flatMap((m) => [m.courte, m.longue]))
  const totalVehicules = stats.vehiculesTotal || 1

  return (
    <>
      <section className="data-card" style={{ marginBottom: 12 }}>
        <div
          className="data-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h2>Statistiques et rapports</h2>
            <p>Indicateurs de performance du parc et des locations</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
            <button
              className="secondary"
              onClick={printPage}
              title="Imprimer cette page"
            >
              <span style={{ marginRight: 6 }}>
                <IconPrint size={15} />
              </span>
              Imprimer
            </button>
            <button className="primary small" onClick={exportRapport}>
              Exporter le rapport PDF
            </button>
          </div>
        </div>
      </section>

      <section className="stats-grid report-stats">
        <article className="kpi-card">
          <p>Chiffre d’affaires</p>
          <strong>
            {formatCompactMillions(stats.caTotal)} <small>{stats.devise}</small>
          </strong>
          <span>Objectif atteint à 92%</span>
        </article>
        <article className="kpi-card">
          <p>Taux d’utilisation</p>
          <strong>
            {formatFr1(stats.tauxUtilisation)} <small>%</small>
          </strong>
          <span>+4,2 pts ce mois</span>
        </article>
        <article className="kpi-card">
          <p>Taux de rotation</p>
          <strong>
            {formatFr1(stats.tauxRotation)} <small>locations/véhicule</small>
          </strong>
          <span>Dans la cible</span>
        </article>
        <article className="kpi-card">
          <p>Réservations abouties</p>
          <strong>
            {pctAbouties} <small>%</small>
          </strong>
          <span>
            {stats.reservationsAbouties} sur {stats.reservationsTotal}
          </span>
        </article>
      </section>

      <section className="report-grid">
        <section className="report-card chart-card">
          <WidgetTitle
            title="Évolution du chiffre d’affaires"
            subtitle="Revenus des 7 derniers jours"
          />
          <div className="chart-wrapper">
            <LineChart
              width={600}
              height={300}
              data={daily}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${Math.round(v)}`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="montant"
                stroke="#FFB020"
                strokeWidth={3}
                dot
              />
            </LineChart>
          </div>
        </section>

        <section className="report-card chart-card">
          <WidgetTitle
            title="État de la flotte"
            subtitle={`${stats.vehiculesTotal} véhicules`}
          />
          <div className="chart-wrapper">
            <PieChart width={400} height={400}>
              <Pie
                data={[
                  {
                    name: "Disponibles",
                    value: fleet.disponible,
                    fill: COLORS[0],
                  },
                  {
                    name: "En location",
                    value: fleet.enLocation,
                    fill: COLORS[1],
                  },
                  {
                    name: "En entretien",
                    value: fleet.entretien,
                    fill: COLORS[2],
                  },
                  {
                    name: "Indisponibles",
                    value: fleet.indisponible,
                    fill: COLORS[3],
                  },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={120}
                labelLine={false}
                label={{ position: "outside", fontSize: 12 }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        </section>

        <section className="report-card chart-card">
          <WidgetTitle
            title="Performance mensuelle"
            subtitle="Comparatif locations courte et longue durée"
          />
          <div className="chart-wrapper">
            <BarChart
              width={600}
              height={300}
              data={monthly}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="courte" fill="#FFB020" radius={[4, 4, 0, 0]} />
              <Bar dataKey="longue" fill="#2D6A4F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </div>
        </section>
      </section>

      {commerciaux && commerciaux.length > 0 && (
        <section className="report-card chart-card">
          <WidgetTitle
            title="Performance des commerciaux"
            subtitle="Chiffre d’affaires et locations conclues"
          />
          <div className="chart-wrapper">
            <BarChart
              width={700}
              height={300}
              data={commerciaux}
              margin={{ top: 20, right: 30, left: 80, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <YAxis dataKey="nom" type="category" tick={{ fontSize: 11 }} />
              <XAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar
                dataKey="chiffreAffaires"
                fill="#4A90E2"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </div>
        </section>
      )}
    </>
  )
}

function IconPrint({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
    </svg>
  )
}
