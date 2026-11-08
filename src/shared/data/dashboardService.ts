// Couche d'accès aux données — branchée sur hertz-server (plus de mocks).

// Les lignes restent au format string[][] pour ne pas toucher aux tableaux.

import { apiFetch } from "@/shared/api/client"

import type { TableData, TableModule } from "./types"

export interface TableResult extends TableData {
  ids: number[]
}

export interface OverviewStats {
  caTotal: number

  devise: string

  caCroissance: string

  vehiculesDisponibles: number

  vehiculesTotal: number

  locationsActives: number

  reservationsEnAttente: number

  tauxUtilisation: number

  tauxRotation: number

  reservationsAbouties: number

  reservationsTotal: number
}

export interface MonthlyPoint {
  mois: string

  courte: number

  longue: number
}

interface VehiculeDto {
  id: number

  immatriculation: string

  marque?: string

  modele?: string

  marqueModele?: string

  categorie?: string

  categorieId?: number

  kilometrage: number

  statut: string
}

export interface CommercialFicheDto {
  id: number

  nom: string

  contact: string

  nomFamille?: string

  prenom?: string | null

  abreviation?: string | null

  telephone?: string | null

  email?: string | null

  agence?: string | null

  codeAgence?: string | null

  locationsConclues: number

  reservationsConclues: number

  passagesGarageConclues: number

  ventesConclues: number

  chiffreAffaires: number

  performance: string
}

export interface LocationFicheDto {
  id: number

  reference: string

  client: string

  vehicule: string

  type: string

  dateDebut?: string

  dateFin: string

  montant?: number

  statut: string
}

export interface ReservationFicheDto {
  id: number

  reference: string

  clientId?: number | null

  clientImport?: string | null

  client: string

  vehicule: string

  immatriculation: string

  dateReservation?: string | null

  vehiculeId?: number | null

  commercialId?: number | null

  commercialImport?: string | null

  dateDepart: string

  dateFin?: string | null

  dureeJours: number

  commercial: string | null

  mission?: string | null

  lieuMission?: string | null

  statutConfirmation?: string | null

  statutFacturation?: string | null

  statutPaiement?: "NON_PAYEE" | "PAYEE"

  statut: string
}

export interface ClientFicheDto {
  id: number

  nom: string

  nomFamille?: string

  prenom?: string | null

  type: string

  telephone: string

  email?: string | null

  adresse?: string | null

  numPermis?: string | null

  locationsCount: number

  derniereOperation: string | null
}

export interface ClientDetailDto extends ClientFicheDto {
  locations: LocationFicheDto[]
}

export interface DailyStat {
  date: string

  montant: number
}

export interface FleetStatus {
  disponible: number

  enLocation: number

  entretien: number

  indisponible: number
}

function normSpace(s: string): string {
  return s.replace(/[   ]/g, " ")
}

export function formatMontant(n: number): string {
  return `${normSpace(n.toLocaleString("fr-FR"))} FCFA`
}

export function formatKm(n: number): string {
  return `${normSpace(n.toLocaleString("fr-FR"))} km`
}

export function formatCompactMillions(n: number): string {
  return `${normSpace(
    (n / 1000000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }),
  )} M`
}

export function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-")

  return `${d}/${m}/${y}`
}

export function formatDuree(jours: number): string {
  return jours <= 1 ? "1 jour" : `${jours} jours`
}

export function formatFr1(n: number): string {
  return normSpace(n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }))
}

export async function fetchTable(module: TableModule): Promise<TableResult> {
  switch (module) {
    case "Véhicules": {
      const rows = await apiFetch<VehiculeDto[]>("/api/vehicules")

      return {
        headers: [
          "Immatriculation",

          "Véhicule",

          "Catégorie",

          "Kilométrage",

          "Situation",
        ],

        rows: rows.map((v) => [
          v.immatriculation,

          v.marqueModele ?? `${v.marque ?? ""} ${v.modele ?? ""}`.trim(),

          v.categorie ?? "—",

          formatKm(v.kilometrage),

          v.statut,
        ]),

        ids: rows.map((v) => v.id),
      }
    }

    case "Commerciaux": {
      const rows = await apiFetch<CommercialFicheDto[]>("/api/commerciaux")

      return {
        headers: [
          "Commercial",

          "Contact",

          "Locations conclues",

          "Chiffre d’affaires",

          "Performance",
        ],

        rows: rows.map((c) => [
          c.nom,

          c.contact,

          String(c.locationsConclues),

          formatMontant(c.chiffreAffaires),

          c.performance,
        ]),

        ids: rows.map((c) => c.id),
      }
    }

    case "Locations": {
      const rows = await apiFetch<LocationFicheDto[]>("/api/locations")

      return {
        headers: ["Contrat", "Client", "Véhicule", "Type", "Échéance", "État"],

        rows: rows.map((l) => [
          l.reference,

          l.client,

          l.vehicule,

          l.type,

          formatDateFr(l.dateFin),

          l.statut,
        ]),

        ids: rows.map((l) => l.id),
      }
    }

    case "Réservations": {
      const rows = await apiFetch<ReservationFicheDto[]>("/api/reservations")

      return {
        headers: [
          "Immatriculation",
          "Véhicule",
          "Agent de vente",
          "Date de Résa",
          "Date de début",
          "Date prévu de retour",
          "Durée (j)",
          "Mission",
          "Lieu de la mission",
          "Client",
          "Statut de confirmation",
          "Statut de la résa",
          "Statut de la facturation",
        ],

        rows: rows.map((r) => [
          r.immatriculation,
          r.vehicule,
          r.commercial ?? "",
          r.dateReservation ? formatDateFr(r.dateReservation) : "",
          r.dateDepart ? formatDateFr(r.dateDepart) : "",
          r.dateFin ? formatDateFr(r.dateFin) : "",
          String(r.dureeJours),
          r.mission ?? "",
          r.lieuMission ?? "",
          r.client,
          r.statutConfirmation ?? "",
          r.statut,
          r.statutFacturation ?? "",
        ]),

        ids: rows.map((r) => r.id),
      }
    }

    case "Clients": {
      const rows = await apiFetch<ClientFicheDto[]>("/api/clients")

      return {
        headers: [
          "Client",

          "Type",

          "Téléphone",

          "Locations",

          "Dernière opération",
        ],

        rows: rows.map((c) => [
          c.nom,

          c.type,

          c.telephone,

          String(c.locationsCount),

          c.derniereOperation ?? "—",
        ]),

        ids: rows.map((c) => c.id),
      }
    }
  }

  throw new Error(`Module de tableau non pris en charge : ${module}`)
}

export function filterTable(data: TableResult, query: string): TableResult {
  const q = query.trim().toLowerCase()

  if (!q) return data

  const keep: number[] = []

  data.rows.forEach((row, i) => {
    if (row.join(" ").toLowerCase().includes(q)) keep.push(i)
  })

  return {
    headers: data.headers,

    rows: keep.map((i) => data.rows[i]!),

    ids: keep.map((i) => data.ids[i]!),
  }
}

export async function fetchOverviewStats(
  debut?: string,
  fin?: string,
): Promise<OverviewStats> {
  const qs = new URLSearchParams()

  if (debut) qs.set("debut", debut)

  if (fin) qs.set("fin", fin)

  const suffix = qs.toString() ? `?${qs.toString()}` : ""

  return apiFetch<OverviewStats>(`/api/stats/overview${suffix}`)
}

export async function fetchRecentLocations(limit = 3): Promise<TableResult> {
  const rows = await apiFetch<LocationFicheDto[]>(
    `/api/locations?limit=${limit}`,
  )

  return {
    headers: ["Opération", "Client", "Véhicule", "Échéance", "État"],

    rows: rows.map((l) => [
      l.reference,

      l.client,

      l.vehicule,

      formatDateFr(l.dateFin),

      l.statut,
    ]),

    ids: rows.map((l) => l.id),
  }
}

export async function fetchMonthly(
  debut?: string,
  fin?: string,
): Promise<MonthlyPoint[]> {
  const qs = new URLSearchParams()

  if (debut) qs.set("debut", debut)

  if (fin) qs.set("fin", fin)

  const suffix = qs.toString() ? `?${qs.toString()}` : ""

  return apiFetch<MonthlyPoint[]>(`/api/stats/monthly${suffix}`)
}

export async function fetchDailyStats(
  debut?: string,
  fin?: string,
): Promise<DailyStat[]> {
  const qs = new URLSearchParams()

  if (debut) qs.set("debut", debut)

  if (fin) qs.set("fin", fin)

  const suffix = qs.toString() ? `?${qs.toString()}` : ""

  return apiFetch<DailyStat[]>(`/api/stats/daily${suffix}`)
}

export async function fetchFleetStatus(): Promise<FleetStatus> {
  return apiFetch<FleetStatus>("/api/stats/fleet-status")
}

export async function fetchCommerciauxFiches(): Promise<CommercialFicheDto[]> {
  return apiFetch<CommercialFicheDto[]>("/api/commerciaux")
}

export async function fetchClientFiche(id: number): Promise<ClientDetailDto> {
  return apiFetch<ClientDetailDto>(`/api/clients/${id}/fiche`)
}

export async function fetchCommercialFiche(
  id: number,
): Promise<CommercialFicheDto> {
  const rows = await apiFetch<CommercialFicheDto[]>("/api/commerciaux")

  const fiche = rows.find((commercial) => commercial.id === id)

  if (!fiche) throw new Error("Commercial introuvable")

  return fiche
}

// Ligne « activité récente » (réutilisée par la page Vue d'ensemble).

export function locationFicheToRecentRow(l: LocationFicheDto): string[] {
  return [l.reference, l.client, l.vehicule, formatDateFr(l.dateFin), l.statut]
}
