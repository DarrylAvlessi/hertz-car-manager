export type DashboardModule = "Vue d’ensemble" | "Commerciaux" | "Véhicules" | "Locations" | "Réservations" | "Clients" | "Statistiques"

export type TableModule = Exclude<DashboardModule, "Vue d’ensemble" | "Statistiques">

export interface TableData {
  headers: string[]
  rows: string[][]
}

export interface AuthUser {
  name: string
  email: string
  role: string
  initials: string
}
