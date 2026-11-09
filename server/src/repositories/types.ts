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

export type VehiculeStatut = "ENTREE_PARC" | "MISE_EN_LOCATION" | "RETOUR_LOCATION" | "SORTIE_INTERNE" | "RETOUR_INTERNE" | "ENVOI_GARAGE" | "RETOUR_GARAGE" | "SORTIE_DEFINITIVE" | "RESERVATION"

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

export type CentreType = "SOCIETE" | "CLIENT" | "PERSONNE" | "AUTRE"

export interface Centre {
  id: number

  nom: string

  typeCentre: CentreType

  clientId: number | null

  client: string | null
}

export interface CentreInput {
  nom: string

  typeCentre: CentreType

  clientId: number | null
}

export interface Agence {
  id: number

  code: string

  nom: string

  adresse: string | null

  telephone: string | null

  actif: boolean
}

export interface AgenceInput {
  code: string

  nom: string

  adresse: string | null

  telephone: string | null

  actif: boolean
}

export interface AgenceRepo {
  list(options?: ListOptions): Promise<Agence[]>

  get(id: number): Promise<Agence | null>

  create(input: AgenceInput): Promise<Agence>

  update(id: number, input: Partial<AgenceInput>): Promise<Agence | null>

  remove(id: number): Promise<boolean>
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

export type PassageGarageType = "REPARATION" | "REVISION" | "ENTRETIEN" | "VISITE_TECHNIQUE" | "AUTRE"

export type PassageGarageStatut = "EN_ATTENTE" | "EN_COURS" | "TERMINEE"

export interface PassageGarage {
  id: number

  typePassage: PassageGarageType

  dateEntree: string

  dateSortiePrevue: string | null

  dateSortieReelle: string | null

  kmEntree: number | null

  kmSortie: number | null

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

  kmSortie?: number | null

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

  agenceId?: number | null

  agence?: string | null

  codeAgence?: string | null

  actif?: boolean
}

export interface CommercialInput {
  nom: string

  prenom?: string

  abreviation?: string

  telephone?: string

  email?: string

  agenceId?: number | null
}

export type Performance = "Excellent" | "Très bien" | "Bien" | "À suivre"

export interface CommercialFiche extends Commercial {
  locationsConclues: number

  reservationsConclues: number

  passagesGarageConclues: number

  ventesConclues: number

  chiffreAffaires: number

  performance: Performance
}

export type LocationStatut = "EN_COURS" | "TERMINEE" | "EN_RETARD" | "EN_PROLONGATION"

export type LocationType = "Courte durée" | "Longue durée"

export interface Location {
  id: number

  reference: string

  clientId: number | null

  vehiculeId: number

  commercialId: number | null

  reservationId?: number | null

  type: LocationType

  dateDebut: string

  dateFin: string

  dateRetourReelle?: string | null

  kmDepart?: number

  kmRetour?: number | null

  kmParcourus?: number | null

  montant: number

  statut: LocationStatut

  observation?: string | null

  modePaiement?: string | null

  referenceFacture?: string | null

  dateFacturation?: string | null

  paye?: boolean | null

  payeImport?: string | null

  datePaiement?: string | null
}

export interface LocationFiche extends Location {
  client: string

  vehicule: string
}

export type ReservationStatut = "À venir" | "En cours" | "Terminée" | "Annulée"

export interface Reservation {
  id: number

  reference: string

  clientId: number | null

  vehiculeId: number | null

  commercialId: number | null

  dateDepart: string

  dureeJours: number

  statut: ReservationStatut

  dateReservation?: string | null

  dateFin?: string | null

  mission?: string | null

  lieuMission?: string | null

  statutConfirmation?: string | null

  statutFacturation?: string | null

  statutPaiement?: "NON_PAYEE" | "PAYEE"

  clientImport?: string | null

  commercialImport?: string | null
}

export interface ReservationImportInput {
  clientId: number | null

  vehiculeId: number

  commercialId: number | null

  clientImport?: string | null

  commercialImport?: string | null

  dateReservation: string | null

  dateDepart: string | null

  dateFin: string | null

  dureeJours: number | null

  mission: string | null

  lieuMission: string | null

  statut: ReservationStatut

  statutConfirmation: string | null

  statutFacturation: "NON_FACTUREE" | "EN_ATTENTE_BON_COMMANDE" | "FACTURE_EMISE_PAIEMENT_EN_ATTENTE" | "PAIEMENT_EFFECTUE"

  statutPaiement: "NON_PAYEE" | "PAYEE"
}

export interface ReservationInput {
  clientId: number | null

  vehiculeId: number

  commercialId: number | null

  dateReservation?: string | null

  dateDepart: string | null

  dateFin: string | null

  mission?: string | null

  lieuMission?: string | null

  statutConfirmation?: string | null

  statutFacturation?:
    | "NON_FACTUREE"
    | "EN_ATTENTE_BON_COMMANDE"
    | "FACTURE_EMISE_PAIEMENT_EN_ATTENTE"
    | "PAIEMENT_EFFECTUE"

  statutPaiement?: "NON_PAYEE" | "PAYEE"
}

export interface ReservationUpdateInput {
  clientId: number | null

  vehiculeId: number

  commercialId: number | null

  clientImport: string | null

  commercialImport: string | null

  dateReservation: string | null

  dateDepart: string | null

  dateFin: string | null

  mission: string | null

  lieuMission: string | null

  statutConfirmation: string | null

  statutFacturation:
    | "NON_FACTUREE"
    | "EN_ATTENTE_BON_COMMANDE"
    | "FACTURE_EMISE_PAIEMENT_EN_ATTENTE"
    | "PAIEMENT_EFFECTUE"

  statutPaiement: "NON_PAYEE" | "PAYEE"
}

export interface ReservationHistoryEntry {
  id: number

  ancienStatut: string | null

  nouveauStatut: string

  dateChangement: string

  commentaire: string | null
}

export interface ReservationLostAffairExportRow {
  agentVente: string | null

  refProforma: string | null

  dateReservation: string | null

  client: string | null

  refBonCommande: string | null

  relance: string | null

  dateAnnulation: string | null

  motifAnnulation: string | null

  vehiculeDemande: string | null

  vehiculePropose: string | null
}

export interface ReservationFiche extends Reservation {
  client: string

  commercial: string | null

  vehicule: string

  immatriculation: string
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

export type MouvementType = "ENTREE_PARC" | "MISE_EN_LOCATION" | "RETOUR_LOCATION" | "SORTIE_INTERNE" | "RETOUR_INTERNE" | "ENVOI_GARAGE" | "RETOUR_GARAGE" | "SORTIE_DEFINITIVE" | "RESERVATION"

export interface Mouvement {
  id: number

  vehiculeId: number

  locationId?: number | null

  passageId?: number | null

  commercialId?: number | null

  validateurId?: number | null

  type: MouvementType

  motif: string | null

  kilometrage: number | null

  date: string

  commentaire: string | null

  kmDepart?: number | null

  kmRetour?: number | null

  kmParcourus?: number | null

  dateRetour?: string | null
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

export interface SinistreImmobilisation {
  vehiculeId: number

  dateDebut: string

  dateFin: string | null
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

  importMany(inputs: VehiculeInput[], adminId: number): Promise<{
    created: number
    updated: number
  }>

  update(id: number, input: Partial<VehiculeInput>): Promise<Vehicule | null>

  remove(id: number): Promise<boolean>
}

export interface CategorieVehiculeRepo {
  list(options?: ListOptions): Promise<CategorieVehicule[]>

  get(id: number): Promise<CategorieVehicule | null>

  create(input: CategorieVehiculeInput): Promise<CategorieVehicule>

  update(
    id: number,
    input: Partial<CategorieVehiculeInput>,
  ): Promise<CategorieVehicule | null>

  remove(id: number): Promise<boolean>
}

export interface ModeleVehiculeRepo {
  list(options?: ListOptions): Promise<ModeleVehicule[]>

  get(id: number): Promise<ModeleVehicule | null>

  create(input: ModeleVehiculeInput): Promise<ModeleVehicule>

  update(
    id: number,
    input: Partial<ModeleVehiculeInput>,
  ): Promise<ModeleVehicule | null>

  remove(id: number): Promise<boolean>
}

export interface CentreRepo {
  list(): Promise<Centre[]>

  get(id: number): Promise<Centre | null>

  create(input: CentreInput): Promise<Centre>

  update(id: number, input: Partial<CentreInput>): Promise<Centre | null>

  remove(id: number): Promise<boolean>
}

export type ConducteurCategorie =
  | "CLIENT"
  | "CHAUFFEUR_HERTZ"
  | "EMPLOYE_HERTZ"
  | "AUTRE"

export interface Conducteur {
  id: number
  nom: string
  prenom: string | null
  telephone: string | null
  numPermis: string | null
  categorie: ConducteurCategorie
  clientId: number | null
  client: string | null
}

export interface ConducteurInput {
  nom: string
  prenom?: string | null
  telephone?: string | null
  numPermis?: string | null
  categorie: ConducteurCategorie
  clientId?: number | null
}

export interface ConducteurRepo {
  list(options?: ListOptions): Promise<Conducteur[]>
  get(id: number): Promise<Conducteur | null>
  create(input: ConducteurInput): Promise<Conducteur>
  update(id: number, input: Partial<ConducteurInput>): Promise<Conducteur | null>
  remove(id: number): Promise<boolean>
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

  update(
    id: number,
    input: Partial<PassageGarageInput>,
  ): Promise<PassageGarage | null>

  remove(id: number): Promise<boolean>
}

export interface ReparationRepo {
  list(options?: ListOptions): Promise<Reparation[]>

  get(id: number): Promise<Reparation | null>

  update(
    id: number,
    input: Partial<ReparationInput>,
  ): Promise<Reparation | null>

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

  importMany(inputs: CommercialInput[], adminId: number): Promise<{
    created: number
    updated: number
  }>

  update(id: number, input: CommercialInput): Promise<Commercial | null>

  remove(id: number): Promise<boolean>
}

export interface LocationRepo {
  refreshStatuses(): Promise<void>

  list(options?: ListOptions): Promise<Location[]>

  fiches(limit?: number): Promise<LocationFiche[]>

  get(id: number): Promise<Location | null>

  create(input: LocationInput): Promise<Location>

  create(input: LocationInput, adminId: number): Promise<Location>

  update(id: number, input: Partial<LocationInput>): Promise<Location | null>

  remove(id: number): Promise<boolean>

  forClient(clientId: number): Promise<LocationFiche[]>

  overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Location[]>
}

export interface LocationInput {
  reference?: string | null

  clientId: number

  vehiculeId: number

  commercialId?: number | null

  type: Location["type"]

  dateDebut: string

  dateFin: string

  kmRetour?: number | null

  montant?: number

  statut?: Location["statut"]

  observation?: string | null

  modePaiement?: string | null

  referenceFacture?: string | null

  dateFacturation?: string | null

  paye?: boolean | null

  payeImport?: string | null

  datePaiement?: string | null

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

  update(
    id: number,
    input: Partial<ProlongationInput>,
  ): Promise<Prolongation | null>

  remove(id: number): Promise<boolean>
}

export interface ReservationRepo {
  refreshStatuses(): Promise<void>

  list(options?: ListOptions): Promise<Reservation[]>

  fiches(): Promise<ReservationFiche[]>

  lostAffairsFromReservations(): Promise<ReservationLostAffairExportRow[]>

  get(id: number): Promise<Reservation | null>

  history(id: number): Promise<ReservationHistoryEntry[]>

  overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Reservation[]>

  create(input: ReservationInput): Promise<Reservation>

  update(id: number, input: ReservationUpdateInput): Promise<Reservation | null>

  remove(id: number): Promise<boolean>

  updateStatus(
    id: number,
    status: ReservationStatut,
  ): Promise<Reservation | null>

  importMany(inputs: ReservationImportInput[]): Promise<number>
}

export interface MaintenanceRepo {
  list(options?: ListOptions): Promise<Maintenance[]>

  get(id: number): Promise<Maintenance | null>

  openForVehicule(vehiculeId: number): Promise<Maintenance | null>

  overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Maintenance[]>
}

export interface MouvementRepo {
  list(vehiculeId?: number): Promise<Mouvement[]>

  createEntry(input: {
    vehiculeId: number
    date: string
    kilometrage: number
    observation?: string | null
  }): Promise<void>

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

    validateurId?: number

    dateDebut?: string

    dateFin?: string

    sortieInterne?: {
      commercialId: number
      motif: string
    }
  }): Promise<Mouvement>

  remove(id: number): Promise<boolean>
}

export type ContraventionPaiement = "IMPAYEE" | "PAYEE"

export type ContraventionRecouvrement =
  | "NON_EFFECTUE"
  | "EFFECTUE"
  | "NON_LIEU"

export interface Contravention {
  id: number
  numeroContravention: string
  type: string
  dateInfraction: string
  montant: number
  frais: number
  devise: string
  statutPaiement: ContraventionPaiement
  dateReglement: string | null
  moyenPaiement: string | null
  numeroQuittance: string | null
  payeur: string | null
  statutRecouvrement: ContraventionRecouvrement
  dateRecouvrement: string | null
  montantRecouvre: number
  fraisRecouvres: number
  vehiculeId: number
  immatriculation: string
  marque: string
  modele: string
  vehicule: string
  clientId: number | null
  client: string | null
  clientImport: string | null
  commercialId: number | null
  commercial: string | null
  commercialImport: string | null
  observation: string | null
}

export interface ContraventionInput {
  numeroContravention: string
  type: string
  dateInfraction: string
  montant: number
  frais?: number
  statutPaiement: ContraventionPaiement
  dateReglement?: string | null
  moyenPaiement?: string | null
  numeroQuittance?: string | null
  payeur?: string | null
  statutRecouvrement: ContraventionRecouvrement
  dateRecouvrement?: string | null
  montantRecouvre?: number
  fraisRecouvres?: number
  vehiculeId: number
  clientId?: number | null
  clientImport?: string | null
  commercialId?: number | null
  commercialImport?: string | null
  observation?: string | null
}

export interface ContraventionRepo {
  list(options?: ListOptions): Promise<Contravention[]>
  get(id: number): Promise<Contravention | null>
  create(input: ContraventionInput): Promise<Contravention>
  update(id: number, input: ContraventionInput): Promise<Contravention | null>
  remove(id: number): Promise<boolean>
  importMany(inputs: ContraventionInput[]): Promise<number>
}

export type VenteMotif = "RENOUVELLEMENT_PARC" | "COUT_ENTRETIEN_ELEVE" | "FIN_CONTRAT" | "ACCIDENT" | "BESOIN_TRESORERIE" | "AUTRE"

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

  remove(id: number): Promise<boolean>

  isMovementLinked(movementId: number): Promise<boolean>
}

export interface StatsPeriod {
  debut?: string

  fin?: string
}

export interface StatsRepo {
  overview(params?: StatsPeriod): Promise<OverviewStats>

  monthly(params?: StatsPeriod): Promise<MonthlyPoint[]>

  daily(params?: StatsPeriod): Promise<DailyStat[]>

  fleetStatus(): Promise<FleetStatus>

  immobilisationsSinistres(): Promise<SinistreImmobilisation[]>
}

export interface Repositories {
  admins: AdminRepo

  agences: AgenceRepo

  categories: CategorieVehiculeRepo

  modeles: ModeleVehiculeRepo

  centres: CentreRepo

  conducteurs: ConducteurRepo

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

  contraventions: ContraventionRepo

  stats: StatsRepo
}
