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
  marqueModele: string
  categorie: string
  kilometrage: number
  statut: string
}

interface CommercialFicheDto {
  id: number
  nom: string
  contact: string
  locationsConclues: number
  chiffreAffaires: number
  performance: string
}

interface LocationFicheDto {
  id: number
  reference: string
  client: string
  vehicule: string
  type: string
  dateFin: string
  statut: string
}

interface ReservationFicheDto {
  id: number
  reference: string
  client: string
  dateDepart: string
  dureeJours: number
  commercial: string | null
  statut: string
}

interface ClientFicheDto {
  id: number
  nom: string
  type: string
  telephone: string
  locationsCount: number
  derniereOperation: string | null
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
        headers: ["Immatriculation", "Véhicule", "Catégorie", "Kilométrage", "Situation"],
        rows: rows.map((v) => [
          v.immatriculation,
          v.marqueModele,
          v.categorie,
          formatKm(v.kilometrage),
          v.statut,
        ]),
        ids: rows.map((v) => v.id),
      }
    }
    case "Commerciaux": {
      const rows = await apiFetch<CommercialFicheDto[]>("/api/commerciaux")
      return {
        headers: ["Commercial", "Contact", "Locations conclues", "Chiffre d’affaires", "Performance"],
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
        headers: ["Réservation", "Client", "Départ", "Durée", "Commercial", "Statut"],
        rows: rows.map((r) => [
          r.reference,
          r.client,
          formatDateFr(r.dateDepart),
          formatDuree(r.dureeJours),
          r.commercial ?? "—",
          r.statut,
        ]),
        ids: rows.map((r) => r.id),
      }
    }
    case "Clients": {
      const rows = await apiFetch<ClientFicheDto[]>("/api/clients")
      return {
        headers: ["Client", "Type", "Téléphone", "Locations", "Dernière opération"],
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

export async function fetchOverviewStats(): Promise<OverviewStats> {
  return apiFetch<OverviewStats>("/api/stats/overview")
}

export async function fetchRecentLocations(limit = 3): Promise<TableResult> {
  const rows = await apiFetch<LocationFicheDto[]>(`/api/locations?limit=${limit}`)
  return {
    headers: ["Opération", "Client", "Véhicule", "Échéance", "État"],
    rows: rows.map((l) => [l.reference, l.client, l.vehicule, formatDateFr(l.dateFin), l.statut]),
    ids: rows.map((l) => l.id),
  }
}

export async function fetchMonthly(): Promise<MonthlyPoint[]> {
  return apiFetch<MonthlyPoint[]>("/api/stats/monthly")
}

// Ligne « activité récente » (réutilisée par la page Vue d'ensemble).
export function locationFicheToRecentRow(l: LocationFicheDto): string[] {
  return [l.reference, l.client, l.vehicule, formatDateFr(l.dateFin), l.statut]
}
