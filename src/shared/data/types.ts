export type DashboardModule = "Vue d’ensemble" | "Commerciaux" | "Parc automobile" | "Catégories véhicules" | "Modèle véhicule" | "Agences" | "Centres" | "Garages" | "Passages garage" | "Réparations" | "Véhicules" | "Mouvements véhicules" | "Ventes de véhicules" | "Réparations" | "Locations" | "Prolongations" | "Réservations" | "Contraventions" | "Clients" | "Conducteurs" | "Statistiques"

export type TableModule = Exclude<DashboardModule, "Vue d’ensemble" | "Statistiques" | "Parc automobile" | "Catégories véhicules" | "Modèle véhicule" | "Agences" | "Centres" | "Garages" | "Passages garage" | "Réparations" | "Mouvements véhicules" | "Ventes de véhicules" | "Prolongations" | "Conducteurs">

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
