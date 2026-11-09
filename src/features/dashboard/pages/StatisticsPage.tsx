import { useEffect, useMemo, useState } from "react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import DatePeriodFilter, {
  type DatePeriod,
} from "@/features/dashboard/components/DatePeriodFilter"
import Icon from "@/shared/components/Icon"
import { apiFetch, exportUrl } from "@/shared/api/client"

interface MonthlyReport {
  key: string
  label: string
  fullLabel: string
  revenue: number
  revenueShort: number
  revenueLong: number
  locations: number
  rentedDays: number
  fleetDays: number
  immobilizedDays: number
  utilization: number
  immobilization: number
  rotation: number
  duration: number
  averageBasket: number
  averageVehicles: number
  evol: string
}

interface BilanReport {
  periode_str: string
  periode_label: string
  segment: string
  perimetre: string
  vehicules_moyenne: string
  warning: string | null
  summary: {
    ca: number
    locations: number
    joursLoues: number
    joursVehicules: number
    joursImmobilises: number
    tauxUtilisation: number
    tauxRotation: number
    tauxImmobilisation: number
    dureeMoyenne: number
    panierMoyen: number
    noVehicles: boolean
    noRentals: boolean
  }
  kpis: Array<{
    label: string
    valeur: string
    delta_text: string
    delta_dir: number
  }>
  lecture_rapide: Array<[string, string]>
  ca_mensuel_table: Array<[string, number, number, number, number, number, number, string]>
  ca_categories: Array<[string, number]>
  split_ca: Array<[string, number, number]>
  top_10_vehicules: Array<[string, string, number, number, number, string]>
  ca_commerciaux: Array<[string, number, string, number]>
  jours_vehicules_split: {
    Loués: number[]
    Immobilisés: number[]
    Disponibles: number[]
  }
  utilisation_categories: Array<[string, number]>
  top_5_plus_utilises: Array<[string, number, number, string]>
  top_5_moins_utilises: Array<[string, number, number, string]>
  histogramme_locations: Array<[string, number]>
  tb_mensuel: Array<[string, string, number, string, string, string, string]>
  tb_periode_row: [string, string, number, string, string, string, string]
  definitions: Array<[string, string, string]>
  monthly: MonthlyReport[]
  revenueByCategory: Array<{ name: string; value: number }>
}

const SERIES = {
  yellow: "#FFCC00",
  ink: "#222222",
  gray: "#DCDCD6",
  grid: "#E8E8E3",
  muted: "#6B6B66",
}

const money = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} F CFA`
const percent = (value: number, precision = 1) =>
  `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)} %`
const integer = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)

const chartMargin = { top: 18, right: 18, left: 8, bottom: 8 }
const tooltipStyle = {
  border: "1px solid #DCDCD6",
  borderRadius: 8,
  fontSize: 12,
}

function periodBounds(period: DatePeriod): { debut?: string; fin?: string } {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (period === "all") return {}

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === "day") return { debut: dateKey(today), fin: dateKey(today) }
  if (period === "week") {
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { debut: dateKey(monday), fin: dateKey(sunday) }
  }
  if (period === "month") {
    return {
      debut: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      fin: dateKey(today),
    }
  }
  return {
    debut: dateKey(new Date(now.getFullYear(), 0, 1)),
    fin: dateKey(today),
  }
}

function Table({
  headers,
  rows,
}: {
  headers: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${String(row[0])}-${index}`}>
              {row.map((value, cell) => (
                <td key={cell} className={cell > 0 ? "numeric" : ""}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <article className="stats-report-card">
      <header>
        <div className="stats-section-mark" />
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </header>
      {children}
    </article>
  )
}

export default function StatisticsPage() {
  const [period, setPeriod] = useState<DatePeriod>("all")
  const [segment, setSegment] = useState("LCD")
  const [report, setReport] = useState<BilanReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfPeriodOpen, setPdfPeriodOpen] = useState(false)
  const [pdfStartDate, setPdfStartDate] = useState("")
  const [pdfEndDate, setPdfEndDate] = useState("")
  const [pdfPeriodError, setPdfPeriodError] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const { debut, fin } = periodBounds(period)
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const query = useMemo(() => {
    const params = new URLSearchParams({ segment })
    if (debut) params.set("debut", debut)
    if (fin) params.set("fin", fin)
    return params.toString()
  }, [debut, fin, segment])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    apiFetch<BilanReport>(`/api/stats/bilan?${query}`)
      .then((result) => {
        if (active) setReport(result)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Chargement impossible")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query])

  useEffect(() => {
    if (!pdfPreviewUrl && !pdfPeriodOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfPreviewUrl(null)
        setPdfPeriodOpen(false)
      }
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [pdfPeriodOpen, pdfPreviewUrl])

  const exportPdf = () => {
    setPdfStartDate(debut && debut <= todayKey ? debut : "")
    setPdfEndDate(fin ? (fin <= todayKey ? fin : todayKey) : "")
    setPdfPeriodError(null)
    setPdfPeriodOpen(true)
  }

  const previewPdf = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Boolean(pdfStartDate) !== Boolean(pdfEndDate)) {
      setPdfPeriodError("Renseignez les deux dates, ou laissez les deux champs vides.")
      return
    }
    if (pdfStartDate && pdfEndDate && pdfStartDate > pdfEndDate) {
      setPdfPeriodError("La date de début doit précéder la date de fin.")
      return
    }

    const params = new URLSearchParams({ segment })
    if (pdfStartDate && pdfEndDate) {
      params.set("debut", pdfStartDate)
      params.set("fin", pdfEndDate)
    }
    setPdfPreviewUrl(exportUrl(`/api/export/rapports/bilan-statistique?${params}`))
    setPdfPeriodOpen(false)
  }

  if (loading && !report) {
    return <section className="data-card"><p className="p-4">Chargement du bilan statistique…</p></section>
  }
  if (error && !report) {
    return (
      <section className="data-card">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Chargement impossible :</strong> {error}
        </div>
      </section>
    )
  }
  if (!report) return null

  const monthlyRevenue = report.monthly.map((month) => ({
    ...month,
    caMillions: month.revenue / 1_000_000,
  }))
  const cumulativeRevenue = monthlyRevenue.reduce<number[]>((values, month, index) => {
    values.push((values[index - 1] ?? 0) + month.caMillions)
    return values
  }, [])
  const revenueByType = report.split_ca.map(([name, value, share]) => ({
    name,
    value,
    share,
  }))
  const vehicleRevenue = report.top_10_vehicules.map(([name, , locations, days, revenue]) => ({
    name,
    locations,
    days,
    revenue: revenue / 1_000_000,
  }))
  const utilizationDistribution = report.monthly.map((month, index) => ({
    month: month.label,
    rented: report.jours_vehicules_split.Loués[index] ?? 0,
    immobilized: report.jours_vehicules_split.Immobilisés[index] ?? 0,
    available: report.jours_vehicules_split.Disponibles[index] ?? 0,
  }))
  const monthlyRotation = report.monthly.map((month) => ({
    ...month,
    locationsCurve: month.locations,
  }))
  const summarySubtitles = [
    "CA total sur la période",
    "Contrats démarrés",
    "Jours-véhicules du parc",
    "Jours loués / jours disponibles du parc",
    "Locations par véhicule",
    "Jours perdus en garage ou sinistre",
  ]

  return (
    <main className="statistics-page">
      <section className="data-card statistics-toolbar">
        <div>
          <p className="stats-eyebrow">HERTZ BÉNIN · {report.perimetre}</p>
          <h2>Statistiques et rapports</h2>
        </div>
        <div className="statistics-controls">
          <DatePeriodFilter value={period} onChange={setPeriod} />
          <select
            className="secondary status-filter"
            aria-label="Périmètre du parc"
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
          >
            <option value="LCD">Location courte durée (LCD)</option>
            <option value="LLD">Location longue durée (LLD)</option>
            <option value="LEASING">Leasing</option>
            <option value="IMPRO">Impro</option>
            <option value="AUTRE">Autre</option>
            <option value="ALL">Tous les segments</option>
          </select>
          <button className="primary small" type="button" onClick={exportPdf}>
            Imprimer le bilan PDF
          </button>
        </div>
      </section>

      {error && <p className="stats-inline-error">Actualisation impossible : {error}</p>}
      {report.warning && <div className="stats-warning" role="status">{report.warning}</div>}

      <section className="statistics-summary" aria-label="Synthèse de la période">
        <div className="statistics-summary-heading">
          <div>
            <p className="stats-eyebrow">SYNTHÈSE · {report.periode_str}</p>
            <h2>Les indicateurs clés</h2>
          </div>
          <span>{report.vehicules_moyenne} véhicules en moyenne</span>
        </div>
        <div className="statistics-kpis">
          {report.kpis.map((kpi, index) => (
            <article className="statistics-kpi" key={kpi.label}>
              <p>{kpi.label}</p>
              <strong>{kpi.valeur}</strong>
              <span>{summarySubtitles[index]}</span>
              <small className={kpi.delta_dir < 0 ? "negative" : ""}>
                {kpi.delta_text || "Aucune période précédente comparable"}
              </small>
            </article>
          ))}
        </div>
        <ReportCard title="Lecture rapide" description="Faits saillants calculés sur la période sélectionnée">
          <ul className="statistics-insights">
            {report.lecture_rapide.map(([label, text], index) => (
              <li key={`${label}-${index}`}><strong>{label}</strong>{text}</li>
            ))}
          </ul>
        </ReportCard>
      </section>

      <nav className="statistics-report-nav" aria-label="Rapports du bilan">
        <a href="#chiffre-affaires">01 · Chiffre d’affaires</a>
        <a href="#utilisation">02 · Utilisation</a>
        <a href="#rotation">03 · Rotation</a>
        <a href="#definitions">04 · Définitions</a>
      </nav>

      <section className="statistics-report-section" id="chiffre-affaires">
        <div className="statistics-section-heading">
          <span>RAPPORT 01</span>
          <h2>Chiffre d’affaires</h2>
          <p>Évolution mensuelle, répartition des revenus et contribution des véhicules et commerciaux.</p>
        </div>
        <div className="statistics-chart-grid">
          <ReportCard title="CA mensuel et cumulé" description="Montants en millions F CFA · rattachement à la date de début">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={290}>
                <ComposedChart data={monthlyRevenue} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="ca" tickFormatter={(value) => `${value} M`} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="cumule" orientation="right" tickFormatter={(value) => `${value} M`} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [`${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M F CFA`, name === "caMillions" ? "CA mensuel" : "CA cumulé"]}
                  />
                  <Legend formatter={(value) => value === "caMillions" ? "CA mensuel" : "CA cumulé"} />
                  <Bar yAxisId="ca" dataKey="caMillions" fill={SERIES.yellow} name="caMillions" />
                  <Line yAxisId="cumule" data={monthlyRevenue.map((month, index) => ({ ...month, cumulative: cumulativeRevenue[index] }))} dataKey="cumulative" stroke={SERIES.ink} strokeWidth={2} dot={{ r: 3 }} name="cumulative" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Courte / longue durée" description="Part du chiffre d’affaires par type de location">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={290}>
                <PieChart>
                  <Pie data={revenueByType} dataKey="value" nameKey="name" innerRadius={66} outerRadius={96} paddingAngle={3}>
                    {revenueByType.map((slice, index) => (
                      <Cell key={slice.name} fill={index === 0 ? SERIES.yellow : SERIES.ink} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={tooltipStyle} />
                  <Legend formatter={(name) => {
                    const item = revenueByType.find((slice) => slice.name === name)
                    return `${name} : ${percent(item?.share ?? 0)}`
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="CA par catégorie" description="Catégories classées par chiffre d’affaires">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={report.ca_categories.map(([name, value]) => ({ name, value }))} layout="vertical" margin={{ ...chartMargin, left: 24 }}>
                  <CartesianGrid stroke={SERIES.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${value} M`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M F CFA`} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={SERIES.yellow} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Top 10 des véhicules" description="Véhicules classés par chiffre d’affaires">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={vehicleRevenue} layout="vertical" margin={{ ...chartMargin, left: 24 }}>
                  <CartesianGrid stroke={SERIES.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${value} M`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(value) => `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M F CFA`} contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" fill={SERIES.yellow} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="CA par commercial" description="Part du chiffre d’affaires et contrats démarrés">
            <Table
              headers={["Commercial", "Locations", "Part du CA"]}
              rows={report.ca_commerciaux.map(([name, count, share]) => [name, integer(count), share])}
            />
          </ReportCard>
          <ReportCard title="Détail mensuel" description="Total de la période calculé sur les valeurs mensuelles">
            <Table
              headers={["Mois", "Locations", "Jours loués", "CA court", "CA long", "CA total", "Panier moyen", "Évol."]}
              rows={[
                ...report.ca_mensuel_table.map(([month, count, days, short, long, total, basket, evolution]) => [
                  month, integer(count), integer(days), integer(short), integer(long), integer(total), integer(basket), evolution,
                ]),
                ["TOTAL", integer(report.summary.locations), integer(report.summary.joursLoues), integer(report.split_ca[0]?.[1] ?? 0), integer(report.split_ca[1]?.[1] ?? 0), integer(report.summary.ca), integer(report.summary.panierMoyen), ""],
              ]}
            />
          </ReportCard>
          <ReportCard title="Véhicules les plus rentables" description="Nombre de locations, jours loués et utilisation">
            <Table
              headers={["Véhicule", "Catégorie", "Locations", "Jours loués", "CA", "Utilisation"]}
              rows={report.top_10_vehicules.map(([name, category, count, days, revenue, usage]) => [
                name, category, integer(count), integer(days), money(revenue), usage,
              ])}
            />
          </ReportCard>
          <ReportCard title="Lecture du chiffre d’affaires">
            <p className="statistics-reading">
              Les trois premiers commerciaux représentent{" "}
              <strong>{percent(report.ca_commerciaux.slice(0, 3).reduce((sum, row) => sum + Number.parseFloat(row[2].replace(",", ".")), 0))}</strong>{" "}
              du CA. Le chiffre d’affaires moyen par location est de{" "}
              <strong>{money(report.summary.panierMoyen)}</strong>.
            </p>
          </ReportCard>
        </div>
      </section>

      <section className="statistics-report-section" id="utilisation">
        <div className="statistics-section-heading">
          <span>RAPPORT 02</span>
          <h2>Utilisation et immobilisation</h2>
          <p>Jours loués, immobilisations garage/sinistre et disponibilité du parc.</p>
        </div>
        <div className="statistics-chart-grid">
          <ReportCard title="Taux d’utilisation mensuel" description="Jours loués ÷ jours-véhicules présents">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyRevenue} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => percent(Number(value))} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="utilization" fill={SERIES.yellow} fillOpacity={0.25} stroke="none" />
                  <Line type="monotone" dataKey="utilization" stroke={SERIES.ink} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Répartition des jours-véhicules" description="Part louée, immobilisée et disponible non louée">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={utilizationDistribution} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => percent(Number(value))} contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="rented" stackId="days" name="Loués" fill={SERIES.yellow} />
                  <Bar dataKey="immobilized" stackId="days" name="Immobilisés" fill={SERIES.ink} />
                  <Bar dataKey="available" stackId="days" name="Disponibles non loués" fill={SERIES.gray} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Utilisation par catégorie" description="Taux de jours loués sur les jours de présence du parc">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={report.utilisation_categories.map(([name, value]) => ({ name, value }))} layout="vertical" margin={{ ...chartMargin, left: 24 }}>
                  <CartesianGrid stroke={SERIES.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => percent(Number(value))} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={SERIES.yellow} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Les véhicules les plus utilisés">
            <Table headers={["Véhicule", "Locations", "Jours", "Taux"]} rows={report.top_5_plus_utilises.map(([name, count, days, rate]) => [name, integer(count), integer(days), rate])} />
          </ReportCard>
          <ReportCard title="Les véhicules les moins utilisés">
            <Table headers={["Véhicule", "Locations", "Jours", "Taux"]} rows={report.top_5_moins_utilises.map(([name, count, days, rate]) => [name, integer(count), integer(days), rate])} />
          </ReportCard>
        </div>
      </section>

      <section className="statistics-report-section" id="rotation">
        <div className="statistics-section-heading">
          <span>RAPPORT 03</span>
          <h2>Rotation du parc</h2>
          <p>Nombre de locations par véhicule, durée moyenne et lecture mensuelle.</p>
        </div>
        <div className="statistics-chart-grid">
          <ReportCard title="Taux de rotation mensuel" description="Locations par véhicule moyen, avec le nombre de contrats">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={monthlyRotation} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="rotation" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="locations" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar yAxisId="rotation" dataKey="rotation" name="Locations / véhicule" fill={SERIES.yellow} />
                  <Line yAxisId="locations" dataKey="locationsCurve" name="Nombre de locations" stroke={SERIES.ink} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Locations par véhicule" description="Répartition du nombre de véhicules par classe de contrats">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.histogramme_locations.map(([name, count]) => ({ name, count }))} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={SERIES.yellow} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Durée moyenne d’une location" description="Jours de location rapportés aux contrats démarrés">
            <div className="statistics-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyRevenue} margin={chartMargin}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} jours`} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="duration" fill={SERIES.yellow} fillOpacity={0.25} stroke="none" />
                  <Line type="monotone" dataKey="duration" stroke={SERIES.ink} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
          <ReportCard title="Tableau de bord mensuel" description="Les taux de période sont recalculés à partir des totaux">
            <Table
              headers={["Mois", "Véhicules (moy.)", "Locations", "Rotation", "Durée moy. (j)", "Utilisation", "Immobilisation"]}
              rows={[
                ...report.tb_mensuel.map(([month, vehicles, count, rotation, duration, utilization, immobilization]) => [
                  month, vehicles, integer(count), rotation, duration, utilization, immobilization,
                ]),
                [...report.tb_periode_row.slice(0, 2), integer(report.tb_periode_row[2]), ...report.tb_periode_row.slice(3)],
              ]}
            />
          </ReportCard>
        </div>
      </section>

      <section className="statistics-report-section" id="definitions">
        <div className="statistics-section-heading">
          <span>MÉTHODE</span>
          <h2>Définitions et sources</h2>
          <p>Les indicateurs sont calculés sur la même période et le même périmètre que les rapports.</p>
        </div>
        <ReportCard title="Comment lire les indicateurs">
          <Table headers={["Indicateur", "Formule", "Précisions"]} rows={report.definitions} />
          <ul className="statistics-caveats">
            <li>Les taux d’utilisation et de rotation ne s’interprètent que sur le segment sélectionné, LCD par défaut.</li>
            <li>Le mois en cours est calculé jusqu’à la date d’édition du rapport.</li>
            <li>Les chiffres reposent sur les saisies de la base ; une location non enregistrée ou un retour non daté peut fausser les indicateurs.</li>
          </ul>
        </ReportCard>
      </section>
      <p className="statistics-source-note">
        Source : base de gestion des locations · période {report.periode_str} · périmètre {report.perimetre}
      </p>
      {pdfPeriodOpen && (
        <div className="stats-pdf-backdrop" onClick={() => setPdfPeriodOpen(false)}>
          <form
            className="stats-pdf-period-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-pdf-period-title"
            onSubmit={previewPdf}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="stats-eyebrow">PARAMÈTRES DU RAPPORT</p>
            <h2 id="stats-pdf-period-title">Choisir la période du PDF</h2>
            <p className="stats-pdf-period-description">
              Sélectionnez les dates à inclure. Laissez les deux champs vides pour utiliser la période par défaut du bilan.
            </p>
            <div className="stats-pdf-date-fields">
              <label>
                Date de début
                <input
                  type="date"
                  max={todayKey}
                  value={pdfStartDate}
                  onChange={(event) => {
                    setPdfStartDate(event.target.value)
                    setPdfPeriodError(null)
                  }}
                />
              </label>
              <label>
                Date de fin
                <input
                  type="date"
                  max={todayKey}
                  value={pdfEndDate}
                  onChange={(event) => {
                    setPdfEndDate(event.target.value)
                    setPdfPeriodError(null)
                  }}
                />
              </label>
            </div>
            {pdfPeriodError && <p className="stats-pdf-period-error" role="alert">{pdfPeriodError}</p>}
            <div className="stats-pdf-period-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setPdfPeriodOpen(false)}
              >
                Annuler
              </button>
              <button className="primary small" type="submit">
                Générer et visualiser le PDF
              </button>
            </div>
          </form>
        </div>
      )}
      {pdfPreviewUrl && (
        <div
          className="stats-pdf-backdrop"
          onClick={() => setPdfPreviewUrl(null)}
        >
          <section
            className="stats-pdf-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Visualisation du bilan statistique PDF"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="stats-pdf-toolbar">
              <div>
                <p className="stats-eyebrow">HERTZ BÉNIN</p>
                <h2>Bilan statistique PDF</h2>
              </div>
              <div className="stats-pdf-actions">
                <a
                  className="secondary"
                  href={`${pdfPreviewUrl}&download=true`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Télécharger
                </a>
                <a
                  className="secondary"
                  href={pdfPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir dans un nouvel onglet
                </a>
                <button
                  className="secondary stats-pdf-close"
                  type="button"
                  onClick={() => setPdfPreviewUrl(null)}
                  aria-label="Fermer le visualiseur PDF"
                  title="Fermer"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </header>
            <iframe
              className="stats-pdf-frame"
              src={pdfPreviewUrl}
              title="Bilan statistique PDF"
            />
          </section>
        </div>
      )}
    </main>
  )
}
