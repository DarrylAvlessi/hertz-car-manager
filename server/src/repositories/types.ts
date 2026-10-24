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

export type VehiculeStatut =
  | "ENTREE_PARC"
  | "MISE_EN_LOCATION"
  | "RETOUR_LOCATION"
  | "SORTIE_INTERNE"
  | "RETOUR_INTERNE"
  | "ENVOI_GARAGE"
  | "RETOUR_GARAGE"
  | "SORTIE_DEFINITIVE"
  | "RESERVATION"
export type VehiculeSegment = "LCD" | "LLD" | "LEASING" | "IMPRO" | "AUTRE"
export type VehiculeCarburant = "ESSENCE" | "DIESEL" | "HYBRIDE" | "ELECTRIQUE"

export interface Vehicule {
  id: number
  immatriculation: string
  marque?: string
  modele?: string
  marqueModele?: string
  categorie?: string | null
  version?: string | null
  annee?: number | null
  numeroChassis?: string | null
  couleur?: string | null
  carburant?: VehiculeCarburant | null
  nbPlaces?: number | null
  kilometrage: number
  segmentParc?: VehiculeSegment
  groupeGeolocalisation?: string | null
  centreId?: number | null
  centre?: string | null
  dateMiseEnService?: string | null
  dateEntreeParc?: string | null
  dateSortieParc?: string | null
  prixAchat?: number | null
  dateAchat?: string | null
  prixVente?: number | null
  dateProchaineVisiteTechnique?: string | null
  dateExpirationAssurance?: string | null
  observation?: string | null
  categorieId?: number | null
  statut: VehiculeStatut
}

export interface VehiculeInput {
  immatriculation: string
  marque: string
  modele: string
  categorieId?: number | null
  version?: string | null
  annee?: number | null
  numeroChassis?: string | null
  couleur?: string | null
  carburant?: VehiculeCarburant | null
  nbPlaces?: number | null
  kilometrage: number
  segmentParc: VehiculeSegment
  groupeGeolocalisation?: string | null
  centreId?: number | null
  dateMiseEnService?: string | null
  dateEntreeParc?: string | null
  dateSortieParc?: string | null
  prixAchat?: number | null
  dateAchat?: string | null
  prixVente?: number | null
  dateProchaineVisiteTechnique?: string | null
  dateExpirationAssurance?: string | null
  observation?: string | null
}

export interface CategorieVehicule {
  id: number
  libelle: string
  tarifJournalier: number
  tarifMensuel: number | null
}

export interface CategorieVehiculeInput {
  libelle: string
  tarifJournalier: number
  tarifMensuel: number | null
}

export interface ModeleVehicule {
  id: number
  marque: string
  nom: string
  nbPlaces: number | null
  categorieId: number | null
  categorie: string | null
}

export interface ModeleVehiculeInput {
  marque: string
  nom: string
  nbPlaces: number | null
  categorieId: number | null
}

export interface Centre {
  id: number
  nom: string
}

export interface Garage {
  id: number
  nom: string
  adresse: string | null
  telephone: string | null
}

export interface GarageInput {
  nom: string
  adresse?: string | null
  telephone?: string | null
}

export type PassageGarageType =
  | "REPARATION"
  | "REVISION"
  | "ENTRETIEN"
  | "VISITE_TECHNIQUE"
  | "AUTRE"
export type PassageGarageStatut = "EN_ATTENTE" | "EN_COURS" | "TERMINEE"

export interface PassageGarage {
  id: number
  typePassage: PassageGarageType
  dateEntree: string
  dateSortiePrevue: string | null
  dateSortieReelle: string | null
  kmEntree: number | null
  motif: string | null
  statut: PassageGarageStatut
  coutTotal: number
  vehiculeId: number
  garageId: number
  vehicule: string | null
  garage: string | null
  vehiculeRemplacementId: number | null
}

export interface PassageGarageInput {
  typePassage: PassageGarageType
  dateEntree: string
  dateSortiePrevue?: string | null
  dateSortieReelle?: string | null
  kmEntree?: number | null
  motif?: string | null
  statut: PassageGarageStatut
  coutTotal?: number
  vehiculeId: number
  garageId: number
  vehiculeRemplacementId?: number | null
}

export interface Reparation {
  id: number
  description: string
  dateReparation: string
  cout: number
  passageId: number
  vehicule: string | null
}

export interface ReparationInput {
  description: string
  cout: number
}

export type ClientType = "Particulier" | "Entreprise"

export interface Client {
  id: number
  nom: string
  type: ClientType
  telephone: string
}

export interface ClientFiche extends Client {
  locationsCount: number
  derniereOperation: string | null
}

export interface Commercial {
  id: number
  nom: string
  contact: string
}

export type Performance = "Excellent" | "Très bien" | "Bien" | "À suivre"

export interface CommercialFiche extends Commercial {
  locationsConclues: number
  chiffreAffaires: number
  performance: Performance
}

export type LocationStatut = "EN_COURS" | "TERMINEE" | "EN_RETARD" | "EN_PROLONGATION"
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
  dateRetourReelle?: string | null
  montant: number
  statut: LocationStatut
}

export interface LocationFiche extends Location {
  client: string
  vehicule: string
}

export type ReservationStatut = "En attente" | "Confirmée" | "Aboutie" | "Non aboutie" | "Annulée"

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
  | "ENTREE_PARC"
  | "MISE_EN_LOCATION"
  | "RETOUR_LOCATION"
  | "SORTIE_INTERNE"
  | "RETOUR_INTERNE"
  | "ENVOI_GARAGE"
  | "RETOUR_GARAGE"
  | "SORTIE_DEFINITIVE"
  | "RESERVATION"

export interface Mouvement {
  id: number
  vehiculeId: number
  locationId?: number | null
  type: MouvementType
  motif: string | null
  kilometrage: number | null
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

export interface CategorieVehiculeRepo {
  list(options?: ListOptions): Promise<CategorieVehicule[]>
  get(id: number): Promise<CategorieVehicule | null>
  create(input: CategorieVehiculeInput): Promise<CategorieVehicule>
  update(id: number, input: Partial<CategorieVehiculeInput>): Promise<CategorieVehicule | null>
  remove(id: number): Promise<boolean>
}

export interface ModeleVehiculeRepo {
  list(options?: ListOptions): Promise<ModeleVehicule[]>
  get(id: number): Promise<ModeleVehicule | null>
  create(input: ModeleVehiculeInput): Promise<ModeleVehicule>
  update(id: number, input: Partial<ModeleVehiculeInput>): Promise<ModeleVehicule | null>
  remove(id: number): Promise<boolean>
}

export interface CentreRepo {
  list(): Promise<Centre[]>
}

export interface GarageRepo {
  list(options?: ListOptions): Promise<Garage[]>
  get(id: number): Promise<Garage | null>
  create(input: GarageInput): Promise<Garage>
  update(id: number, input: Partial<GarageInput>): Promise<Garage | null>
  remove(id: number): Promise<boolean>
}

export interface PassageGarageRepo {
  list(options?: ListOptions): Promise<PassageGarage[]>
  get(id: number): Promise<PassageGarage | null>
  update(id: number, input: Partial<PassageGarageInput>): Promise<PassageGarage | null>
  remove(id: number): Promise<boolean>
}

export interface ReparationRepo {
  list(options?: ListOptions): Promise<Reparation[]>
  get(id: number): Promise<Reparation | null>
  update(id: number, input: Partial<ReparationInput>): Promise<Reparation | null>
  remove(id: number): Promise<boolean>
}

export interface ClientRepo {
  list(options?: ListOptions): Promise<Client[]>
  get(id: number): Promise<Client | null>
  fiches(): Promise<ClientFiche[]>
}

export interface CommercialRepo {
  list(options?: ListOptions): Promise<Commercial[]>
  get(id: number): Promise<Commercial | null>
  fiches(): Promise<CommercialFiche[]>
}

export interface LocationRepo {
  refreshStatuses(): Promise<void>
  list(options?: ListOptions): Promise<Location[]>
  fiches(limit?: number): Promise<LocationFiche[]>
  get(id: number): Promise<Location | null>
  create(input: LocationInput): Promise<Location>
  update(id: number, input: Partial<LocationInput>): Promise<Location | null>
  remove(id: number): Promise<boolean>
  forClient(clientId: number): Promise<LocationFiche[]>
  overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]>
}

export interface LocationInput {
  reference?: string | null
  clientId: number
  vehiculeId: number
  commercialId?: number | null
  type: Location["type"]
  dateDebut: string
  dateFin: string
  montant?: number
  statut?: Location["statut"]
  prolongation?: ProlongationInput
}

export interface Prolongation {
  id: number
  locationId: number
  ancienneDateFin: string | null
  nouvelleDateFin: string
  statut: "EN_COURS" | "EXPIRE"
  dateDemande: string
  motif: string | null
  montantSupplementaire: number
  commercialId: number | null
}

export interface ProlongationInput {
  locationId: number
  ancienneDateFin?: string | null
  nouvelleDateFin: string
  dateDemande: string
  motif?: string | null
  montantSupplementaire: number
  commercialId?: number | null
}

export interface ProlongationRepo {
  list(): Promise<Prolongation[]>
  get(id: number): Promise<Prolongation | null>
  create(input: ProlongationInput): Promise<Prolongation>
  update(id: number, input: Partial<ProlongationInput>): Promise<Prolongation | null>
  remove(id: number): Promise<boolean>
}

export interface ReservationRepo {
  list(options?: ListOptions): Promise<Reservation[]>
  fiches(): Promise<ReservationFiche[]>
  get(id: number): Promise<Reservation | null>
  overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]>
}

export interface MaintenanceRepo {
  list(options?: ListOptions): Promise<Maintenance[]>
  get(id: number): Promise<Maintenance | null>
  openForVehicule(vehiculeId: number): Promise<Maintenance | null>
}

export interface MouvementRepo {
  list(vehiculeId?: number): Promise<Mouvement[]>
  createEntry(input: { vehiculeId: number; date: string; kilometrage: number; observation?: string | null }): Promise<void>
  changeVehicleStatus(input: {
    vehiculeId: number
    statut: VehiculeStatut
    kilometrage: number
    observation?: string | null
    garageId?: number
    typePassage?: PassageGarageType
    motif?: string | null
    typeLocation?: Location["type"]
    clientId?: number
    commercialId?: number
    dateDebut?: string
    dateFin?: string
  }): Promise<Mouvement>
  remove(id: number): Promise<boolean>
}

export type VenteMotif =
  | "RENOUVELLEMENT_PARC"
  | "COUT_ENTRETIEN_ELEVE"
  | "FIN_CONTRAT"
  | "ACCIDENT"
  | "BESOIN_TRESORERIE"
  | "AUTRE"
export type VenteEtatVehicule = "BON" | "MOYEN" | "MAUVAIS" | "ACCIDENTE" | "EPAVE" | "POUR_PIECES"
export type VenteCanal = "PARTICULIER" | "GARAGE_PROFESSIONNEL" | "ENCHERES" | "CLIENT_LOCATION" | "APPEL_OFFRES" | "AUTRE"
export type VentePaiementStatut = "NON_PAYEE" | "PARTIELLE" | "PAYEE"
export type VenteStatut = "CONCLUE" | "ANNULEE"

export interface VenteVehicule {
  id: number
  numeroVente: string
  vehiculeId: number
  acheteurId: number
  dateVente: string
  prixVente: number
  devise: string
  fraisVente: number
  motifVente: VenteMotif
  etatVehicule: VenteEtatVehicule
  kilometrageVente: number
  canalVente: VenteCanal | null
  statutPaiement: VentePaiementStatut
  dateRemiseVehicule: string | null
  referenceCession: string | null
  statut: VenteStatut
  dateAnnulation: string | null
  motifAnnulation: string | null
  factureId: number | null
  mouvementId: number
  commercialId: number | null
  administrateurId: number
  observation: string | null
  dateCreation: string
}

export interface VenteVehiculeInput {
  numeroVente: string
  vehiculeId: number
  acheteurId: number
  dateVente: string
  prixVente: number
  devise?: string
  fraisVente?: number
  motifVente: VenteMotif
  etatVehicule: VenteEtatVehicule
  kilometrageVente: number
  canalVente?: VenteCanal | null
  statutPaiement?: VentePaiementStatut
  dateRemiseVehicule?: string | null
  referenceCession?: string | null
  factureId?: number | null
  commercialId?: number | null
  observation?: string | null
}

export interface VenteVehiculeRepo {
  list(options?: ListOptions): Promise<VenteVehicule[]>
  get(id: number): Promise<VenteVehicule | null>
  create(input: VenteVehiculeInput, adminId: number): Promise<VenteVehicule>
  isMovementLinked(movementId: number): Promise<boolean>
}

export interface StatsRepo {
  overview(): Promise<OverviewStats>
  monthly(): Promise<MonthlyPoint[]>
}

export interface Repositories {
  admins: AdminRepo
  categories: CategorieVehiculeRepo
  modeles: ModeleVehiculeRepo
  centres: CentreRepo
  garages: GarageRepo
  passagesGarage: PassageGarageRepo
  reparations: ReparationRepo
  vehicules: VehiculeRepo
  clients: ClientRepo
  commerciaux: CommercialRepo
  locations: LocationRepo
  prolongations: ProlongationRepo
  reservations: ReservationRepo
  maintenances: MaintenanceRepo
  mouvements: MouvementRepo
  ventesVehicules: VenteVehiculeRepo
  stats: StatsRepo
}
