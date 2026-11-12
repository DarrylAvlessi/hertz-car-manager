import type {
  Commercial,
  Location,
  Maintenance,
  PassageGarage,
  Repositories,
  Vehicule,
} from "../../repositories/types.js"

export interface BilanReport {
  periode_str: string
  date_edition: string
  edite_par: string
  perimetre: string
  mois_couverts: number
  vehicules_moyenne: string
  periode_label: string
  segment: string
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
    is_good: boolean
  }>
  lecture_rapide: Array<[string, string]>
  mois_labels: string[]
  ca_mensuel_table: Array<[string, number, number, number, number, number, number, string]>
  ca_total_row: [string, number, number, number, number, number, number, string]
  split_ca: Array<[string, number, number]>
  ca_categories: Array<[string, number]>
  top_10_vehicules: Array<[string, string, number, number, number, string]>
  ca_commerciaux: Array<[string, number, string, number]>
  taux_utilisation_mensuel: number[]
  objectif_utilisation: number | null
  jours_vehicules_split: {
    Loués: number[]
    Immobilisés: number[]
    Disponibles: number[]
  }
  utilisation_categories: Array<[string, number]>
  top_5_plus_utilises: Array<[string, number, number, string]>
  top_5_moins_utilises: Array<[string, number, number, string]>
  rotation_mensuelle: number[]
  locations_mensuelles: number[]
  duree_moyenne_mensuelle: number[]
  histogramme_locations: Array<[string, number]>
  tb_mensuel: Array<[string, string, number, string, string, string, string]>
  tb_periode_row: [string, string, number, string, string, string, string]
  definitions: Array<[string, string, string]>
  monthly: Array<{
    key: string
    label: string
    fullLabel: string
    revenue: number
    locations: number
    rentedDays: number
    fleetDays: number
    immobilizedDays: number
    utilization: number
    immobilization: number
    rotation: number
    duration: number
    revenueShort: number
    revenueLong: number
    averageBasket: number
    evol: string
    averageVehicles: number
  }>
  revenueByCategory: Array<{ name: string; value: number }>
  utilizationByCategory: Array<{ name: string; value: number }>
  topVehicles: Array<{ name: string; category: string; locations: number; days: number; revenue: number; utilization: number }>
  commercialRevenue: Array<{ name: string; locations: number; revenue: number; share: number }>
}

interface SinistreImmobilisation {
  vehiculeId: number
  dateDebut: string
  dateFin: string | null
}

interface ReportSources {
  vehicles: Vehicule[]
  locations: Location[]
  passages: PassageGarage[]
  maintenances: Maintenance[]
  commercials: Commercial[]
  sinistres: SinistreImmobilisation[]
}

const DAY_MS = 86_400_000
const MONTHS = [
  "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
]

function dayDate(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match?.[1] ?? null
}

function utcDay(value: string): number {
  return Date.parse(`${value}T00:00:00Z`)
}

function dateKey(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

function shiftDay(value: string, days: number): string {
  return dateKey(utcDay(value) + days * DAY_MS)
}

function monthKey(value: string): string {
  return value.slice(0, 7)
}

function monthStart(value: string): string {
  return `${monthKey(value)}-01`
}

function monthLabel(value: string): string {
  const [yearText, monthText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  return `${MONTHS[month - 1] ?? ""} ${String(year).slice(-2)}`
}

function monthFullLabel(value: string): string {
  const [yearText, monthText] = value.split("-")
  const month = Number(monthText)
  return `${MONTHS[month - 1] ?? ""} ${yearText}`
}

function monthList(debut: string, fin: string): string[] {
  const months: string[] = []
  let cursor = monthStart(debut)
  while (cursor <= fin) {
    months.push(monthKey(cursor))
    const [year, month] = cursor.split("-").map(Number)
    cursor = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`
  }
  return months
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function fr(value: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function variation(current: number, previous: number, unit: "%" | "pts"): string {
  if (previous === 0) return ""
  const delta = unit === "pts" ? current - previous : ((current - previous) / previous) * 100
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : ""
  return `${sign}${fr(Math.abs(delta), 1)} ${unit}  vs période précédente`
}

function deltaDirection(value: number, beneficialWhenLower = false): number {
  return value === 0 ? 0 : (value > 0) !== beneficialWhenLower ? 1 : -1
}

function truncate(value: string, length = 38): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function labelVehicle(vehicle: Vehicule): string {
  return truncate(`${vehicle.immatriculation} · ${vehicle.marqueModele ?? [vehicle.marque, vehicle.modele].filter(Boolean).join(" ")}`)
}

function rentalType(location: Location): "short" | "long" {
  return location.type.toLowerCase().includes("long") ? "long" : "short"
}

function rentalInterval(location: Location): [string, string] | null {
  const start = dayDate(location.dateDebut)
  const end = dayDate(location.dateRetourReelle ?? location.dateFin)
  if (!start || !end) return null
  return [start, end <= start ? shiftDay(start, 1) : end]
}

function overlapDays(start: string, endExclusive: string, periodStart: string, periodEndExclusive: string): string[] {
  const first = Math.max(utcDay(start), utcDay(periodStart))
  const last = Math.min(utcDay(endExclusive), utcDay(periodEndExclusive))
  const days: string[] = []
  for (let cursor = first; cursor < last; cursor += DAY_MS) days.push(dateKey(cursor))
  return days
}

function average(items: number[]): number {
  return items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : 0
}

function buildRange(
  sources: ReportSources,
  debut: string,
  fin: string,
  segment: string,
) {
  const periodEndExclusive = shiftDay(fin, 1)
  const vehicles = sources.vehicles.filter((vehicle) =>
    segment === "ALL" || (vehicle.segmentParc ?? "LCD") === segment,
  )
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  const categories = new Map<number, string>()
  const validLocations = sources.locations.filter((location) => vehicleMap.has(location.vehiculeId))
  const rentalsStarted = validLocations.filter((location) => {
    const start = dayDate(location.dateDebut)
    return start != null && start >= debut && start <= fin
  })
  const monthKeys = monthList(debut, fin)
  const months = new Map(monthKeys.map((key) => [key, {
    key, label: monthLabel(key), fullLabel: monthFullLabel(key),
    revenue: 0, locations: 0, rentedDays: 0, durationDays: 0, fleetDays: 0,
    immobilizedDays: 0, utilization: 0, immobilization: 0,
    rotation: 0, duration: 0,
  }]))
  const rentalDaysByVehicle = new Map<number, Set<string>>()
  const immobilizedByVehicle = new Map<number, Set<string>>()
  const vehicleDaysById = new Map<number, number>()

  for (const vehicle of vehicles) {
    const start = dayDate(vehicle.dateEntreeParc) ?? debut
    const saleDate = dayDate(vehicle.dateSortieParc)
    const end = saleDate ? shiftDay(saleDate, 1) : periodEndExclusive
    const days = overlapDays(start, end, debut, periodEndExclusive)
    vehicleDaysById.set(vehicle.id, days.length)
    for (const day of days) {
      const month = months.get(monthKey(day))
      if (month) month.fleetDays += 1
    }
    categories.set(vehicle.id, vehicle.categorie?.trim() || "Non classé")
  }

  for (const location of validLocations) {
    const interval = rentalInterval(location)
    if (!interval) continue
    const [start, end] = interval
    const overlappingDays = overlapDays(start, end, debut, periodEndExclusive)
    let rented = rentalDaysByVehicle.get(location.vehiculeId)
    if (!rented) rentalDaysByVehicle.set(location.vehiculeId, (rented = new Set()))
    overlappingDays.forEach((day) => rented!.add(day))

    const startDay = dayDate(location.dateDebut)
    if (startDay && startDay >= debut && startDay <= fin) {
      const month = months.get(monthKey(startDay))
      if (month) {
        month.locations += 1
        month.revenue += location.montant
        month.durationDays += Math.max(1, Math.floor((utcDay(end) - utcDay(start)) / DAY_MS))
      }
    }
    for (const day of overlappingDays) {
      const month = months.get(monthKey(day))
      if (month) month.rentedDays += 1
    }
  }

  const immobilizationIntervals = [
    ...sources.passages.map((passage) => ({
      vehiculeId: passage.vehiculeId,
      start: dayDate(passage.dateEntree),
      end: dayDate(passage.dateSortieReelle) ?? periodEndExclusive,
    })),
    ...sources.maintenances.map((maintenance) => ({
      vehiculeId: maintenance.vehiculeId,
      start: dayDate(maintenance.dateEntree),
      end: dayDate(maintenance.dateSortie) ?? periodEndExclusive,
    })),
    ...sources.sinistres.map((sinistre) => ({
      vehiculeId: sinistre.vehiculeId,
      start: dayDate(sinistre.dateDebut),
      end: dayDate(sinistre.dateFin) ?? periodEndExclusive,
    })),
  ]
  for (const interval of immobilizationIntervals) {
    if (!interval.start || !vehicleMap.has(interval.vehiculeId)) continue
    const days = overlapDays(interval.start, interval.end, debut, periodEndExclusive)
    let immobile = immobilizedByVehicle.get(interval.vehiculeId)
    if (!immobile) immobilizedByVehicle.set(interval.vehiculeId, (immobile = new Set()))
    days.forEach((day) => immobile!.add(day))
  }
  for (const [vehicleId, days] of immobilizedByVehicle) {
    const rented = rentalDaysByVehicle.get(vehicleId)
    for (const day of days) {
      if (rented?.has(day)) continue
      const month = months.get(monthKey(day))
      if (month) month.immobilizedDays += 1
    }
  }

  const monthRows = [...months.values()]
  for (const month of monthRows) {
    const monthStartDate = `${month.key}-01`
    const [year, monthNumber] = month.key.split("-").map(Number)
    const nextMonth = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}-01`
    const realEnd = month.key === monthKey(fin) ? fin : shiftDay(nextMonth, -1)
    const realStart = month.key === monthKey(debut) ? debut : monthStartDate
    const daysObserved = Math.max(1, Math.floor((utcDay(realEnd) - utcDay(realStart)) / DAY_MS) + 1)
    const rentedDays = month.rentedDays
    const immobDays = month.immobilizedDays
    month.utilization = month.fleetDays ? round(rentedDays / month.fleetDays * 100) : 0
    month.immobilization = month.fleetDays ? round(immobDays / month.fleetDays * 100, 3) : 0
    const averageVehicles = month.fleetDays / daysObserved
    month.rotation = averageVehicles ? round(month.locations / averageVehicles, 2) : 0
    month.duration = month.locations ? round(month.durationDays / month.locations, 1) : 0
    if (month.rentedDays + month.immobilizedDays > month.fleetDays) {
      throw new Error(
        `Incohérence de flotte en ${month.fullLabel} : les jours loués et immobilisés dépassent les jours-véhicules disponibles.`,
      )
    }
  }

  const ca = rentalsStarted.reduce((sum, location) => sum + location.montant, 0)
  const locationsCount = rentalsStarted.length
  const rentedDays = monthRows.reduce((sum, month) => sum + month.rentedDays, 0)
  const fleetDays = monthRows.reduce((sum, month) => sum + month.fleetDays, 0)
  const immobilizedDays = monthRows.reduce((sum, month) => sum + month.immobilizedDays, 0)
  const observedDays = Math.max(1, Math.floor((utcDay(fin) - utcDay(debut)) / DAY_MS) + 1)
  const avgVehicles = fleetDays / observedDays
  const utilization = fleetDays ? round(rentedDays / fleetDays * 100) : 0
  const immobilization = fleetDays ? round(immobilizedDays / fleetDays * 100, 3) : 0
  const rotation = avgVehicles ? round(locationsCount / avgVehicles, 2) : 0
  const duration = locationsCount ? round(rentedDays / locationsCount, 1) : 0

  const revenuePerVehicle = new Map<number, number>()
  const locationsPerVehicle = new Map<number, number>()
  const daysPerVehicle = new Map<number, number>()
  const categoryRevenue = new Map<string, number>()
  const categoryFleetDays = new Map<string, number>()
  const categoryRentedDays = new Map<string, number>()
  const commercialRevenue = new Map<number | null, { locations: number; revenue: number }>()

  for (const vehicle of vehicles) {
    const category = categories.get(vehicle.id) ?? "Non classé"
    categoryFleetDays.set(category, (categoryFleetDays.get(category) ?? 0) + (vehicleDaysById.get(vehicle.id) ?? 0))
    const rented = rentalDaysByVehicle.get(vehicle.id)
    const days = rented?.size ?? 0
    daysPerVehicle.set(vehicle.id, days)
    categoryRentedDays.set(category, (categoryRentedDays.get(category) ?? 0) + days)
  }
  for (const location of rentalsStarted) {
    revenuePerVehicle.set(location.vehiculeId, (revenuePerVehicle.get(location.vehiculeId) ?? 0) + location.montant)
    locationsPerVehicle.set(location.vehiculeId, (locationsPerVehicle.get(location.vehiculeId) ?? 0) + 1)
    const category = categories.get(location.vehiculeId) ?? "Non classé"
    categoryRevenue.set(category, (categoryRevenue.get(category) ?? 0) + location.montant)
    const commercial = commercialRevenue.get(location.commercialId ?? null) ?? { locations: 0, revenue: 0 }
    commercial.locations += 1
    commercial.revenue += location.montant
    commercialRevenue.set(location.commercialId ?? null, commercial)
  }

  const vehicleNameById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  const vehicleRows = [...vehicles].map((vehicle) => {
    const vehicleRevenue = revenuePerVehicle.get(vehicle.id) ?? 0
    const days = daysPerVehicle.get(vehicle.id) ?? 0
    const vehicleDays = vehicleDaysById.get(vehicle.id) ?? 0
    return {
      name: labelVehicle(vehicle),
      category: categories.get(vehicle.id) ?? "Non classé",
      locations: locationsPerVehicle.get(vehicle.id) ?? 0,
      days,
      revenue: vehicleRevenue,
      utilization: vehicleDays ? round(days / vehicleDays * 100) : 0,
      vehicleDays,
      id: vehicle.id,
    }
  })
  const topVehicles = vehicleRows.filter((item) => item.locations > 0).sort((a, b) => b.revenue - a.revenue)
  const activeByCategory = [...categoryFleetDays.keys()].map((name) => ({
    name,
    value: categoryFleetDays.get(name)
      ? round((categoryRentedDays.get(name) ?? 0) / (categoryFleetDays.get(name) ?? 1) * 100)
      : 0,
  })).sort((a, b) => b.value - a.value)
  const commercialName = new Map(sources.commercials.map((commercial) => [commercial.id, commercial.nom]))
  const allCommercials = [...commercialRevenue.entries()].map(([id, value]) => ({
    name: id === null ? "Non attribué" : commercialName.get(id) ?? `Commercial #${id}`,
    locations: value.locations,
    revenue: value.revenue,
    share: ca ? value.revenue / ca * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue)
  const topCommercials = allCommercials.slice(0, 8)

  const caByMonth = new Map(monthRows.map((month) => [month.key, month.revenue]))
  const monthlyRevenueRows = monthRows.map((month, index) => {
    const started = rentalsStarted.filter((location) => dayDate(location.dateDebut)?.slice(0, 7) === month.key)
    const shortCa = started.filter((location) => rentalType(location) === "short").reduce((sum, location) => sum + location.montant, 0)
    const longCa = started.filter((location) => rentalType(location) === "long").reduce((sum, location) => sum + location.montant, 0)
    const previousRevenue = index ? caByMonth.get(monthRows[index - 1]!.key) ?? 0 : 0
    const evol = index && previousRevenue
      ? `${((month.revenue - previousRevenue) / previousRevenue < 0 ? "−" : month.revenue === previousRevenue ? "" : "+")}${fr(Math.abs((month.revenue - previousRevenue) / previousRevenue * 100), 0)} %`
      : ""
    const averageBasket = started.length ? month.revenue / started.length : 0
    return {
      ...month,
      revenueShort: shortCa,
      revenueLong: longCa,
      averageBasket,
      evol,
    }
  })

  return {
    monthRows,
    monthlyRevenueRows,
    rentalsStarted,
    vehicles,
    vehicleRows,
    topVehicles,
    activeByCategory,
    categoryRevenue,
    allCommercials,
    topCommercials,
    summary: {
      ca, locations: locationsCount, rentedDays, fleetDays, immobilizedDays,
      utilization, immobilization, rotation, duration,
      panierMoyen: locationsCount ? ca / locationsCount : 0,
      avgVehicles,
      noVehicles: vehicles.length === 0,
      noRentals: locationsCount === 0,
    },
    vehicleNameById,
  }
}

function deltaFor(current: number, previous: number, unit: "%" | "pts", beneficialWhenLower = false) {
  const text = variation(current, previous, unit)
  const deltaValue = unit === "pts" ? current - previous : (previous ? (current - previous) / previous * 100 : current)
  return {
    text,
    direction: deltaDirection(deltaValue, beneficialWhenLower),
  }
}

function makeDefaultPeriod(today: string): [string, string] {
  const [year, month] = today.split("-").map(Number)
  const first = new Date(Date.UTC(year, month - 12, 1))
  return [dateKey(first.getTime()), today]
}

function parsePeriod(debut?: string, fin?: string): [string, string] {
  const today = new Date().toISOString().slice(0, 10)
  const [defaultStart, defaultEnd] = makeDefaultPeriod(today)
  const start = debut ?? defaultStart
  const end = fin ? (fin > today ? today : fin) : defaultEnd
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error("Période statistique invalide : fournissez des dates ISO cohérentes.")
  }
  return [start, end]
}

function percentChange(current: number, previous: number): number | null {
  return previous ? round((current - previous) / previous * 100) : null
}

export async function buildBilanReport(
  repos: Repositories,
  options: { debut?: string; fin?: string; segment?: string },
): Promise<BilanReport> {
  const segment = options.segment ?? "LCD"
  if (!["LCD", "LLD", "LEASING", "IMPRO", "AUTRE", "ALL"].includes(segment)) {
    throw new Error("Segment statistique invalide.")
  }
  const [debut, fin] = parsePeriod(options.debut, options.fin)
  const [vehicles, locations, passages, maintenances, commercials, sinistres] = await Promise.all([
    repos.vehicules.list(),
    repos.locations.list(),
    repos.passagesGarage.list(),
    repos.maintenances.list(),
    repos.commerciaux.list(),
    repos.stats.immobilisationsSinistres(),
  ])
  const sources: ReportSources = { vehicles, locations, passages, maintenances, commercials, sinistres }
  const current = buildRange(sources, debut, fin, segment)
  const periodLength = Math.floor((utcDay(fin) - utcDay(debut)) / DAY_MS) + 1
  const previousEnd = shiftDay(debut, -1)
  const previousStart = shiftDay(previousEnd, -(periodLength - 1))
  const previous = buildRange(sources, previousStart, previousEnd, segment).summary
  const summary = current.summary
  const keys = current.monthRows.map((month) => month.key)
  const fullPeriod = `${debut.slice(8, 10)}/${debut.slice(5, 7)}/${debut.slice(0, 4)} au ${fin.slice(8, 10)}/${fin.slice(5, 7)}/${fin.slice(0, 4)}`
  const months = current.monthRows
  const revenueByCategory = [...current.categoryRevenue.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const caTotalShort = current.rentalsStarted.filter((location) => rentalType(location) === "short").reduce((sum, location) => sum + location.montant, 0)
  const caTotalLong = current.rentalsStarted.filter((location) => rentalType(location) === "long").reduce((sum, location) => sum + location.montant, 0)
  const totalRevenue = summary.ca
  const top10Revenue = current.topVehicles.slice(0, 10).reduce((sum, vehicle) => sum + vehicle.revenue, 0)
  const bestMonth = current.monthRows.reduce((best, month) => month.revenue > best.revenue ? month : best, current.monthRows[0]!)
  const utilizationMonths = current.monthRows.filter((month) => month.fleetDays > 0)
  const peak = utilizationMonths.reduce((best, month) => month.utilization > best.utilization ? month : best, utilizationMonths[0])
  const trough = utilizationMonths.reduce((best, month) => month.utilization < best.utilization ? month : best, utilizationMonths[0])
  const kpiDeltas = [
    deltaFor(summary.ca, previous.ca, "%"),
    deltaFor(summary.locations, previous.locations, "%"),
    deltaFor(summary.rentedDays, previous.rentedDays, "%"),
    deltaFor(summary.utilization, previous.utilization, "pts"),
    deltaFor(summary.rotation, previous.rotation, "%"),
    deltaFor(summary.immobilization, previous.immobilization, "pts", true),
  ]
  const labels = [
    "CHIFFRE D'AFFAIRES", "LOCATIONS", "JOURS LOUÉS",
    "TAUX D'UTILISATION", "TAUX DE ROTATION", "TAUX D'IMMOBILISATION",
  ]
  const values = [
    `${fr(summary.ca / 1_000_000, 1)} M F CFA`,
    fr(summary.locations),
    fr(summary.rentedDays),
    `${fr(summary.utilization, 1)} %`,
    `${fr(summary.rotation, 2)} loc./véh.`,
    `${fr(summary.immobilization, 3)} %`,
  ]
  const kpis = labels.map((label, index) => ({
    label,
    valeur: values[index]!,
    delta_text: kpiDeltas[index]!.text,
    delta_dir: kpiDeltas[index]!.direction,
    is_good: true,
  }))
  const totalLocationsByMonth = months.reduce((sum, month) => sum + month.locations, 0)
  const totalRentedDaysByMonth = months.reduce((sum, month) => sum + month.rentedDays, 0)
  if (Math.abs(totalRevenue - months.reduce((sum, month) => sum + month.revenue, 0)) > 0.01 ||
      totalLocationsByMonth !== summary.locations ||
      totalRentedDaysByMonth !== summary.rentedDays ||
      Math.abs(caTotalShort + caTotalLong - totalRevenue) > 0.01 ||
      Math.abs(revenueByCategory.reduce((sum, item) => sum + item.value, 0) - totalRevenue) > 0.01 ||
      Math.abs(current.allCommercials.reduce((sum, item) => sum + item.revenue, 0) - totalRevenue) > 0.01) {
    throw new Error("Contrôle de cohérence du bilan impossible : les totaux de CA, locations ou jours loués divergent.")
  }

  const monthly = current.monthlyRevenueRows.map((month) => {
    const [year, monthNumber] = month.key.split("-").map(Number)
    const monthStartDate = `${month.key}-01`
    const nextMonth = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}-01`
    const monthEnd = shiftDay(nextMonth, -1)
    const start = month.key === monthKey(debut) ? debut : monthStartDate
    const end = month.key === monthKey(fin) ? fin : monthEnd
    const daysObserved = Math.floor((utcDay(end) - utcDay(start)) / DAY_MS) + 1
    return { ...month, averageVehicles: month.fleetDays / Math.max(1, daysObserved) }
  })
  const caMonthlyTable = current.monthlyRevenueRows.map((month) => [
    month.fullLabel,
    month.locations,
    month.rentedDays,
    month.revenueShort,
    month.revenueLong,
    month.revenue,
    Math.round(month.averageBasket),
    month.evol,
  ] as [string, number, number, number, number, number, number, string])
  const topVehicleRows = current.topVehicles.slice(0, 10).map((vehicle) => [
    vehicle.name,
    vehicle.category,
    vehicle.locations,
    vehicle.days,
    Math.round(vehicle.revenue),
    `${fr(vehicle.utilization)} %`,
  ] as [string, string, number, number, number, string])
  const commercialRows = current.topCommercials.map((commercial) => [
    commercial.name,
    commercial.locations,
    `${fr(commercial.share, 1)} %`,
    commercial.share,
  ] as [string, number, string, number])
  const allVehicleRows = current.vehicleRows.filter((vehicle) => vehicle.vehicleDays > 0)
  const rankedUsed = [...allVehicleRows].sort((a, b) => b.utilization - a.utilization)
  const usedRows = rankedUsed.slice(0, 5).map((vehicle) => [
    vehicle.name, vehicle.locations, vehicle.days, `${fr(vehicle.utilization)} %`,
  ] as [string, number, number, string])
  const leastRows = [...rankedUsed].reverse().slice(0, 5).map((vehicle) => [
    vehicle.name, vehicle.locations, vehicle.days, `${fr(vehicle.utilization)} %`,
  ] as [string, number, number, string])
  const locationBins = new Map<string, number>()
  const bins = ["0", "1 à 10", "11 à 20", "21 à 30", "31 à 40", "> 40"]
  for (const vehicle of current.vehicleRows) {
    const count = vehicle.locations
    const bin = count === 0 ? "0" : count <= 10 ? "1 à 10" : count <= 20 ? "11 à 20" : count <= 30 ? "21 à 30" : count <= 40 ? "31 à 40" : "> 40"
    locationBins.set(bin, (locationBins.get(bin) ?? 0) + 1)
  }
  const tbRows = monthly.map((month) => [
    month.fullLabel,
    fr(month.averageVehicles, 1),
    month.locations,
    fr(month.rotation, 2),
    fr(month.duration, 1),
    `${fr(month.utilization, 1)} %`,
    `${fr(month.immobilization, 3)} %`,
  ] as [string, string, number, string, string, string, string])
  const concentration = totalRevenue ? round(top10Revenue / totalRevenue * 100) : 0
  const quickRead: Array<[string, string]> = [
    ["Chiffre d'affaires : ", `${fr(summary.ca)} F CFA sur la période${previous.ca ? `, soit ${variation(summary.ca, previous.ca, "%").split("  ")[0]} par rapport à la période précédente` : ""}${bestMonth && bestMonth.revenue > 0 ? `. Meilleur mois : ${bestMonth.fullLabel} (${fr(bestMonth.revenue / 1_000_000, 1)} M F CFA)` : ""}.`],
    ["Utilisation : ", `${fr(summary.utilization, 1)} % des jours disponibles du parc ont été loués${peak && trough ? `. Pic en ${peak.fullLabel} (${fr(peak.utilization)} %), creux en ${trough.fullLabel} (${fr(trough.utilization)} %)` : ""}.`],
    ["Rotation : ", `${fr(summary.rotation, 2)} locations par véhicule, pour une durée moyenne de ${fr(summary.duration, 1)} jours par location.`],
    ["Immobilisation : ", `${fr(summary.immobilization, 3)} % des jours-véhicules sont perdus (${fr(summary.immobilizedDays)} jours).`],
    ["Concentration : ", `les 10 véhicules les plus rentables réalisent ${fr(concentration)} % du chiffre d'affaires.`],
  ]
  if (!summary.locations) quickRead.unshift(["Aucune location enregistrée sur la période : ", "les indicateurs de location sont à zéro."])
  const caTotalRow: BilanReport["ca_total_row"] = [
    "Total",
    summary.locations,
    summary.rentedDays,
    caTotalShort,
    caTotalLong,
    summary.ca,
    Math.round(summary.panierMoyen),
    "",
  ]
  const avgVehicleCount = summary.avgVehicles
  const tbPeriod: BilanReport["tb_periode_row"] = [
    "Période",
    fr(avgVehicleCount, 1),
    summary.locations,
    fr(summary.rotation, 2),
    fr(summary.duration, 1),
    `${fr(summary.utilization, 1)} %`,
    `${fr(summary.immobilization, 3)} %`,
  ]
  const monthCount = keys.length
  const warning = monthCount > 12
    ? "Plus de 12 mois sélectionnés ; les tableaux mensuels seront très serrés."
    : summary.noVehicles
      ? `Aucun véhicule n'est enregistré dans le segment ${segment}.`
      : null

  return {
    periode_str: fullPeriod,
    date_edition: new Date().toLocaleDateString("fr-FR"),
    edite_par: "Direction d'exploitation",
    perimetre: segment === "ALL" ? "Tous les segments" : "Flotte de location courte durée",
    mois_couverts: monthCount,
    vehicules_moyenne: fr(avgVehicleCount, 1),
    periode_label: fullPeriod,
    segment,
    warning,
    summary: {
      ca: summary.ca,
      locations: summary.locations,
      joursLoues: summary.rentedDays,
      joursVehicules: summary.fleetDays,
      joursImmobilises: summary.immobilizedDays,
      tauxUtilisation: summary.utilization,
      tauxRotation: summary.rotation,
      tauxImmobilisation: summary.immobilization,
      dureeMoyenne: summary.duration,
      panierMoyen: summary.panierMoyen,
      noVehicles: summary.noVehicles,
      noRentals: summary.noRentals,
    },
    kpis,
    lecture_rapide: quickRead,
    mois_labels: monthly.map((month) => month.label),
    ca_mensuel_table: caMonthlyTable,
    ca_total_row: caTotalRow,
    split_ca: [
      ["Courte durée", caTotalShort, totalRevenue ? round(caTotalShort / totalRevenue * 100) : 0],
      ["Longue durée", caTotalLong, totalRevenue ? round(caTotalLong / totalRevenue * 100) : 0],
    ],
    ca_categories: revenueByCategory.length
      ? revenueByCategory.map((item) => [item.name, round(item.value / 1_000_000, 1)])
      : [["Aucune donnée", 0]],
    top_10_vehicules: topVehicleRows.length
      ? topVehicleRows
      : [["Aucune donnée", "—", 0, 0, 0, "n.d."]],
    ca_commerciaux: commercialRows.length
      ? commercialRows
      : [["Aucune donnée", 0, "0 %", 0]],
    taux_utilisation_mensuel: months.map((month) => month.utilization),
    objectif_utilisation: null,
    jours_vehicules_split: {
      Loués: months.map((month) => month.fleetDays ? round(month.rentedDays / month.fleetDays * 100) : 0),
      Immobilisés: months.map((month) => month.fleetDays ? round(month.immobilizedDays / month.fleetDays * 100, 3) : 0),
      Disponibles: months.map((month) => month.fleetDays ? round(Math.max(0, month.fleetDays - month.rentedDays - month.immobilizedDays) / month.fleetDays * 100) : 0),
    },
    utilisation_categories: current.activeByCategory.length
      ? current.activeByCategory.map((item) => [item.name, item.value])
      : [["Aucune donnée", 0]],
    top_5_plus_utilises: usedRows.length
      ? usedRows
      : Array.from({ length: 5 }, () => ["Aucune donnée", 0, 0, "n.d."] as [string, number, number, string]),
    top_5_moins_utilises: leastRows.length
      ? leastRows
      : Array.from({ length: 5 }, () => ["Aucune donnée", 0, 0, "n.d."] as [string, number, number, string]),
    rotation_mensuelle: months.map((month) => month.rotation),
    locations_mensuelles: months.map((month) => month.locations),
    duree_moyenne_mensuelle: months.map((month) => month.duration),
    histogramme_locations: locationBins.size
      ? bins.filter((bin) => locationBins.has(bin)).map((bin) => [bin, locationBins.get(bin)!])
      : [["0", 0]],
    tb_mensuel: tbRows,
    tb_periode_row: tbPeriod,
    definitions: [
      ["Chiffre d'affaires", "Somme de location.montant_total", "Rattaché au mois de la date de début ; prolongations et suppléments inclus."],
      ["Jour loué", "Jour calendaire sous contrat", "Départ inclus, retour exclu ; minimum un jour par location."],
      ["Jours-véhicules du parc", "Somme des jours de présence des véhicules", "De date_entree_parc à date_sortie_parc ; entrée inconnue = début de période."],
      ["Taux d'utilisation", "Jours loués ÷ jours-véhicules du parc × 100", "Calculé sur les totaux de la période et le segment sélectionné."],
      ["Taux de rotation", "Locations démarrées ÷ nombre moyen de véhicules", "Nombre moyen = jours-véhicules ÷ jours observés."],
      ["Taux d'immobilisation", "Jours d'immobilisation ÷ jours-véhicules × 100", "Garage ou sinistre immobilisant ; les chevauchements ne sont comptés qu'une fois."],
      ["Durée moyenne", "Jours loués ÷ nombre de locations", "Durée moyenne d'une location, en jours."],
      ["Panier moyen", "Chiffre d'affaires ÷ nombre de locations", "Montant moyen d'une location, en F CFA."],
    ],
    monthly,
    revenueByCategory: revenueByCategory.map((item) => ({ name: item.name, value: item.value })),
    utilizationByCategory: current.activeByCategory,
    topVehicles: current.topVehicles.slice(0, 10),
    commercialRevenue: current.allCommercials,
  }
}
