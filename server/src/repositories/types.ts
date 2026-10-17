// Types métier partagés (miroir du schéma MySQL + contrats repositories).
// Convention : snake_case en BDD, camelCase en TS. Les repositories exposent
// toujours du camelCase, quel que soit le driver (memory | mysql).

export type Role = "responsable" | "admin"

export interface Admin {
  id: number
  nom: string
  email: string
  role: Role
}

export interface AdminRecord extends Admin {
  passwordHash: string
}

export type VehiculeStatut = "Disponible" | "En location" | "Entretien" | "Indisponible"

export interface Vehicule {
  id: number
  immatriculation: string
  marqueModele: string
  categorie: string
  kilometrage: number
  statut: VehiculeStatut
}

export interface VehiculeInput {
  immatriculation: string
  marqueModele: string
  categorie: string
  kilometrage: number
  statut: VehiculeStatut
}

export type ClientType = "Particulier" | "Entreprise" | "Organisation"

export interface Client {
  id: number
  nom: string
  nomFamille?: string
  prenom?: string | null
  type: ClientType
  telephone: string
  email?: string | null
  adresse?: string | null
  numPermis?: string | null
}

export interface ClientInput {
  nom: string
  prenom?: string
  type: ClientType
  telephone: string
  email?: string
  adresse?: string
  numPermis?: string
}

export type ClientUpdateInput = ClientInput

export interface ClientFiche extends Client {
  locationsCount: number
  derniereOperation: string | null
}

export interface Commercial {
  id: number
  nom: string
  nomFamille?: string
  contact: string
  prenom?: string | null
  abreviation?: string | null
  telephone?: string | null
  email?: string | null
  actif?: boolean
}

export interface CommercialInput {
  nom: string
  prenom?: string
  abreviation?: string
  telephone?: string
  email?: string
}

export type Performance = "Excellent" | "Très bien" | "Bien" | "À suivre"

export interface CommercialFiche extends Commercial {
  locationsConclues: number
  chiffreAffaires: number
  performance: Performance
}

export type LocationStatut = "En cours" | "À retourner" | "Retourné" | "En retard" | "Annulé"
export type LocationType = "Courte durée" | "Longue durée"

export interface Location {
  id: number
  reference: string
  clientId: number
  vehiculeId: number
  commercialId: number | null
  type: LocationType
  dateDebut: string
  dateFin: string
  montant: number
  statut: LocationStatut
}

export interface LocationInput {
  clientId: number
  vehiculeId: number
  commercialId: number
  type: LocationType
  dateDebut: string
  dateFin: string
  montant: number
}

export interface LocationFiche extends Location {
  client: string
  vehicule: string
}

export type ReservationStatut =
  | "En attente"
  | "Confirmée"
  | "Aboutie"
  | "Non aboutie"
  | "Reportée"
  | "Expirée"
  | "Annulée"

export interface Reservation {
  id: number
  reference: string
  clientId: number
  vehiculeId: number | null
  commercialId: number | null
  dateDepart: string
  dureeJours: number
  statut: ReservationStatut
}

export interface ReservationInput {
  clientId: number
  vehiculeId: number
  commercialId: number
  dateDepart: string
  dateFin: string
}

export interface ReservationFiche extends Reservation {
  client: string
  commercial: string | null
}

export type MaintenanceStatut = "En cours" | "Terminée"

export interface Maintenance {
  id: number
  vehiculeId: number
  dateEntree: string
  dateSortie: string | null
  motif: string
  cout: number
  remplacementId: number | null
  statut: MaintenanceStatut
}

export type MouvementType =
  | "Acquisition"
  | "Mise en location"
  | "Retour"
  | "Vente"
  | "Maintenance"
  | "Sortie interne"
  | "Retour interne"

export interface Mouvement {
  id: number
  vehiculeId: number
  type: MouvementType
  date: string
  commentaire: string | null
}

export interface ListOptions {
  q?: string
  limit?: number
}

export interface OverviewStats {
  caTotal: number
  devise: string
  caCroissance: string
  vehiculesDisponibles: number
  vehiculesTotal: number
  locationsActives: number
  reservationsEnAttente: number
  // Calculs lot Darryl (définitions : voir MemoryStatsRepo/MysqlStatsRepo).
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

// --- Contrats repositories (implémentés en memory/ et mysql/) ---

export interface AdminRepo {
  findByEmail(email: string): Promise<AdminRecord | null>
  findById(id: number): Promise<Admin | null>
}

export interface VehiculeRepo {
  list(options?: ListOptions): Promise<Vehicule[]>
  get(id: number): Promise<Vehicule | null>
  findByImmatriculation(immat: string): Promise<Vehicule | null>
  create(input: VehiculeInput, adminId: number): Promise<Vehicule>
  update(id: number, input: Partial<VehiculeInput>): Promise<Vehicule | null>
  remove(id: number): Promise<boolean>
}

export interface ClientRepo {
  list(options?: ListOptions): Promise<Client[]>
  get(id: number): Promise<Client | null>
  fiches(): Promise<ClientFiche[]>
  create(input: ClientInput, adminId: number): Promise<Client>
  update(id: number, input: ClientUpdateInput): Promise<Client | null>
  remove(id: number): Promise<boolean>
}

export interface CommercialRepo {
  list(options?: ListOptions): Promise<Commercial[]>
  get(id: number): Promise<Commercial | null>
  fiches(): Promise<CommercialFiche[]>
  create(input: CommercialInput, adminId: number): Promise<Commercial>
  update(id: number, input: CommercialInput): Promise<Commercial | null>
  deactivate(id: number): Promise<boolean>
}

export interface LocationRepo {
  list(options?: ListOptions): Promise<Location[]>
  fiches(limit?: number): Promise<LocationFiche[]>
  get(id: number): Promise<Location | null>
  forClient(clientId: number): Promise<LocationFiche[]>
  overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]>
  create(input: LocationInput, adminId: number): Promise<Location>
}

export interface ReservationRepo {
  list(options?: ListOptions): Promise<Reservation[]>
  fiches(): Promise<ReservationFiche[]>
  get(id: number): Promise<Reservation | null>
  overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]>
  create(input: ReservationInput): Promise<Reservation>
}

export interface MaintenanceRepo {
  list(options?: ListOptions): Promise<Maintenance[]>
  get(id: number): Promise<Maintenance | null>
  openForVehicule(vehiculeId: number): Promise<Maintenance | null>
  overlapping(vehiculeId: number, debut: string, fin: string): Promise<Maintenance[]>
}

export interface MouvementRepo {
  list(vehiculeId?: number): Promise<Mouvement[]>
}

export interface StatsRepo {
  overview(): Promise<OverviewStats>
  monthly(): Promise<MonthlyPoint[]>
}

export interface Repositories {
  admins: AdminRepo
  vehicules: VehiculeRepo
  clients: ClientRepo
  commerciaux: CommercialRepo
  locations: LocationRepo
  reservations: ReservationRepo
  maintenances: MaintenanceRepo
  mouvements: MouvementRepo
  stats: StatsRepo
}
