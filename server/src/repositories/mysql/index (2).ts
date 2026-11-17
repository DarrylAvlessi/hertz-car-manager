import type mysql from "mysql2/promise"
import { badRequest, conflict } from "../../lib/httpErrors.js"

import type {
  Admin,
  AdminCreateInput,
  AdminProfileInput,
  AdminRecord,
  AdminRepo,
  Agence,
  AgenceInput,
  AgenceRepo,
  CategorieVehicule,
  CategorieVehiculeInput,
  CategorieVehiculeRepo,
  Centre,
  CentreInput,
  CentreRepo,
  Conducteur,
  ConducteurInput,
  ConducteurRepo,
  Garage,
  GarageInput,
  GarageRepo,
  PassageGarage,
  PassageGarageInput,
  PassageGarageRepo,
  Reparation,
  ReparationInput,
  ReparationRepo,
  Client,
  ClientFiche,
  ClientInput,
  ClientRepo,
  ClientUpdateInput,
  Commercial,
  CommercialFiche,
  CommercialInput,
  CommercialRepo,
  Contravention,
  ContraventionInput,
  ContraventionRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationRepo,
  LocationInput,
  Prolongation,
  ProlongationInput,
  ProlongationRepo,
  ModeleVehicule,
  ModeleVehiculeInput,
  ModeleVehiculeRepo,
  Maintenance,
  MaintenanceRepo,
  DailyStat,
  FleetStatus,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  SinistreImmobilisation,
  StatsPeriod,
  Repositories,
  Reservation,
  ReservationHistoryEntry,
  ReservationLostAffairExportRow,
  ReservationImportInput,
  ReservationFiche,
  ReservationInput,
  ReservationUpdateInput,
  ReservationRepo,
  Role,
  StatsRepo,
  Vehicule,
  VehiculeInput,
  VehiculeRepo,
  VenteVehicule,
  VenteVehiculeInput,
  VenteVehiculeRepo,
} from "../types.js"

import {
  addDays,
  AvailabilityConflictError,
  ReservationStatusConflictError,
  overlaps,
  performanceOf,
} from "../helpers.js"

type Row = Record<string, unknown>

const num = (v: unknown): number => Number(v ?? 0)

const str = (v: unknown): string => String(v ?? "")

const strNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v)

const numNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

function mapAdminRole(value: unknown): Role {
  const role = String(value)
  if (role === "responsable" || role === "admin" || role === "superadmin") {
    return role
  }
  throw new Error(`Rôle administrateur MySQL inconnu : ${role}`)
}

function mapClientType(value: unknown): Client["type"] {
  switch (String(value).toUpperCase()) {
    case "PARTICULIER":
      return "Particulier"

    case "ENTREPRISE":
      return "Entreprise"

    case "ORGANISATION":
      return "Organisation"

    default:
      throw new Error(`Type de client MySQL inconnu : ${String(value)}`)
  }
}

async function assertVehicleAvailable(
  connection: mysql.PoolConnection,

  vehiculeId: number,

  debut: string,

  fin: string,

  ignoreReservationId?: number,
): Promise<void> {
  const vehicles = await query<Row>(
    connection,

    "SELECT statut FROM vehicule WHERE id_vehicule = ? FOR UPDATE",

    [vehiculeId],
  )

  if (!vehicles[0]) throw new Error("Véhicule introuvable")

  if (
    ![
      "ENTREE_PARC",
      "RETOUR_LOCATION",
      "RETOUR_INTERNE",
      "RETOUR_GARAGE",
      "MISE_EN_LOCATION",
    ].includes(str(vehicles[0].statut))
  ) {
    throw new AvailabilityConflictError(
      "Véhicule indisponible pour la location",
    )
  }

  const garages = await query<Row>(
    connection,

    `SELECT id_passage, motif
       FROM passage_garage
      WHERE id_vehicule = ?
        AND statut IN ('A_VENIR', 'EN_COURS')
        AND date_entree <= ?
        AND COALESCE(date_sortie_reelle, date_sortie_prevue, '9999-12-31') >= ?
      LIMIT 1`,

    [vehiculeId, fin, debut],
  )

  if (garages[0]) {
    throw new AvailabilityConflictError(
      `Véhicule au garage sur la période${
        garages[0].motif ? ` (${str(garages[0].motif)})` : ""
      }`,
    )
  }

  const locations = await query<Row>(
    connection,

    `SELECT id_location
       FROM location
      WHERE id_vehicule = ?
        AND statut IN ('EN_COURS', 'EN_RETARD', 'EN_PROLONGATION')
        AND DATE(date_debut) <= ?
        AND DATE(GREATEST(COALESCE(date_retour_reelle, date_fin_prevue), CURRENT_DATE)) >= ?
      LIMIT 1`,

    [vehiculeId, fin, debut],
  )

  if (locations[0]) {
    throw new AvailabilityConflictError("Véhicule déjà loué sur la période")
  }

  const reservations = await query<Row>(
    connection,

    `SELECT id_reservation
       FROM reservation
      WHERE id_vehicule = ?
        AND statut IN ('A_VENIR', 'EN_COURS')
        AND date_debut_prevue <= ?
        AND date_fin_prevue >= ?
        ${ignoreReservationId ? "AND id_reservation <> ?" : ""}
      LIMIT 1`,

    ignoreReservationId
      ? [vehiculeId, fin, debut, ignoreReservationId]
      : [vehiculeId, fin, debut],
  )

  if (reservations[0]) {
    throw new AvailabilityConflictError("Véhicule déjà réservé sur la période")
  }
}

async function inTransaction<T>(
  pool: mysql.Pool,

  action: (connection: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const result = await action(connection)

    await connection.commit()

    return result
  } catch (error) {
    await connection.rollback()

    throw error
  } finally {
    connection.release()
  }
}

const today = (): string => {
  const date = new Date()

  const month = String(date.getMonth() + 1).padStart(2, "0")

  const day = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${month}-${day}`
}

function mapVehicule(r: Row): Vehicule {
  return {
    id: num(r.id),

    immatriculation: str(r.immatriculation),

    marque: str(r.marque),

    modele: str(r.modele),

    version: strNull(r.version),

    annee: numNull(r.annee),

    numeroChassis: strNull(r.numero_chassis),

    couleur: strNull(r.couleur),

    carburant: r.carburant as Vehicule["carburant"],

    nbPlaces: numNull(r.nb_places),

    kilometrage: num(r.kilometrage),

    segmentParc: r.segment_parc as Vehicule["segmentParc"],

    groupeGeolocalisation: strNull(r.groupe_geolocalisation),

    centreId: numNull(r.centre_id),

    centre: strNull(r.centre),

    dateMiseEnService: r.date_mise_en_service
      ? str(r.date_mise_en_service).slice(0, 10)
      : null,

    dateEntreeParc: r.date_entree_parc
      ? str(r.date_entree_parc).slice(0, 10)
      : null,

    dateSortieParc: r.date_sortie_parc
      ? str(r.date_sortie_parc).slice(0, 10)
      : null,

    prixAchat: numNull(r.prix_achat),

    dateAchat: r.date_achat ? str(r.date_achat).slice(0, 10) : null,

    dateProchaineVisiteTechnique: r.date_prochaine_visite_technique
      ? str(r.date_prochaine_visite_technique).slice(0, 10)
      : null,

    dateExpirationAssurance: r.date_expiration_assurance
      ? str(r.date_expiration_assurance).slice(0, 10)
      : null,

    observation: strNull(r.observation),

    categorieId: numNull(r.categorie_id),

    statut: r.statut as Vehicule["statut"],
  }
}

function mapLocation(r: Row): Location {
  return {
    id: num(r.id ?? r.id_location),

    reference: str(r.reference ?? r.numero_contrat),

    clientId: numNull(r.client_id ?? r.id_client),

    vehiculeId: num(r.vehicule_id ?? r.id_vehicule),

    commercialId: numNull(r.commercial_id ?? r.id_commercial),

    reservationId: numNull(r.id_reservation),

    type: (r.type ??
      (r.type_location === "LONGUE_DUREE"
        ? "Longue durée"
        : "Courte durée")) as Location["type"],

    dateDebut: locationDateTime(r.date_debut ?? r.date_debut_prevue),

    dateFin: locationDateTime(r.date_fin ?? r.date_fin_prevue),

    dateRetourReelle: r.date_retour_reelle
      ? locationDateTime(r.date_retour_reelle)
      : null,

    kmDepart: num(r.km_depart),

    kmRetour: numNull(r.km_retour),

    kmParcourus: numNull(r.km_parcourus),

    montant: num(r.montant ?? r.montant_total),

    statut: r.statut as Location["statut"],

    observation: strNull(r.observation),

    modePaiement: strNull(r.mode_paiement_export ?? r.mode_paiement_import),

    referenceFacture: strNull(
      r.reference_facture_export ?? r.reference_facture_import,
    ),

    dateFacturation: strNull(
      r.date_facturation_export ?? r.date_facturation_import,
    ),

    paye:
      r.paye_import == null
        ? r.statut_paiement === "PAYEE"
        : ["OUI", "YES", "TRUE", "1"].includes(
            str(r.paye_import).trim().toUpperCase(),
          ),

    payeImport: strNull(r.paye_import),

    datePaiement: strNull(r.date_paiement_export ?? r.date_paiement_import),
  }
}

function sqlDateTime(value: string): string {
  const normalized = value.trim().replace("T", " ")

  return normalized.length === 16 ? `${normalized}:00` : normalized
}

function localSqlDateTimeNow(): string {
  const now = new Date()

  const pad = (value: number) => String(value).padStart(2, "0")

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

async function refreshRentalStatuses(pool: mysql.Pool): Promise<void> {
  const now = localSqlDateTimeNow()

  await pool.query(
    "UPDATE prolongation_location SET statut = 'EXPIRE' WHERE statut = 'EN_COURS' AND nouvelle_date_fin < ?",

    [now],
  )

  await pool.query(
    `UPDATE location l SET l.statut = 'EN_RETARD'
      WHERE l.statut IN ('EN_COURS', 'EN_PROLONGATION')
        AND l.date_fin_prevue < ?
        AND (l.statut = 'EN_COURS' OR NOT EXISTS (
          SELECT 1 FROM prolongation_location p
           WHERE p.id_location = l.id_location AND p.statut = 'EN_COURS'
        ))`,

    [now],
  )
}

function locationDateTime(value: unknown): string {
  return str(value).replace(" ", "T").slice(0, 16)
}

function mapMaintenance(r: Row): Maintenance {
  const statut = String(r.statut).toUpperCase()

  if (
    statut !== "EN_ATTENTE" &&
    statut !== "EN_COURS" &&
    statut !== "TERMINEE"
  ) {
    throw new Error(
      `Statut de passage garage MySQL inconnu : ${String(r.statut)}`,
    )
  }

  return {
    id: num(r.id),

    vehiculeId: num(r.vehicule_id),

    dateEntree: str(r.date_entree),

    dateSortie: r.date_sortie ? str(r.date_sortie).slice(0, 10) : null,

    motif: str(r.motif),

    cout: num(r.cout),

    remplacementId: numNull(r.remplacement_id),

    statut: statut === "TERMINEE" ? "Terminée" : "En cours",
  }
}

function mapProlongation(r: Row): Prolongation {
  return {
    id: num(r.id_prolongation),

    locationId: num(r.id_location),

    ancienneDateFin: r.ancienne_date_fin
      ? locationDateTime(r.ancienne_date_fin)
      : null,

    nouvelleDateFin: locationDateTime(r.nouvelle_date_fin),

    statut: r.statut as Prolongation["statut"],

    dateDemande: locationDateTime(r.date_demande),

    motif: strNull(r.motif),

    montantSupplementaire: num(r.montant_supplementaire),

    commercialId: numNull(r.id_commercial),
  }
}

function mapVenteVehicule(r: Row): VenteVehicule {
  return {
    id: num(r.id_vente),

    numeroVente: str(r.numero_vente),

    vehiculeId: num(r.id_vehicule),

    acheteurId: num(r.id_acheteur),

    dateVente: str(r.date_vente),

    prixVente: num(r.prix_vente),

    devise: str(r.devise),

    fraisVente: num(r.frais_vente),

    motifVente: r.motif_vente as VenteVehicule["motifVente"],

    etatVehicule: r.etat_vehicule as VenteVehicule["etatVehicule"],

    kilometrageVente: num(r.kilometrage_vente),

    canalVente: r.canal_vente as VenteVehicule["canalVente"],

    statutPaiement: r.statut_paiement as VenteVehicule["statutPaiement"],

    dateRemiseVehicule: r.date_remise_vehicule
      ? str(r.date_remise_vehicule)
      : null,

    referenceCession: strNull(r.reference_cession),

    statut: r.statut as VenteVehicule["statut"],

    dateAnnulation: r.date_annulation
      ? str(r.date_annulation).slice(0, 10)
      : null,

    motifAnnulation: strNull(r.motif_annulation),

    factureId: numNull(r.id_facture),

    mouvementId: num(r.id_mouvement),

    commercialId: numNull(r.id_commercial),

    administrateurId: num(r.id_administrateur),

    observation: strNull(r.observation),

    dateCreation: str(r.date_creation),
  }
}

function mapReservation(r: Row): Reservation {
  const statut = str(r.statut)

  return {
    id: num(r.id ?? r.id_reservation),

    reference: str(r.reference ?? r.ref_proforma ?? r.id_reservation),

    clientId: numNull(r.client_id ?? r.id_client),

    vehiculeId: numNull(r.vehicule_id ?? r.id_vehicule),

    commercialId: numNull(r.commercial_id ?? r.id_commercial),

    dateDepart:
      strNull(r.date_depart ?? r.date_debut_prevue)?.slice(0, 10) ?? "",

    dureeJours: num(r.duree_jours_import ?? r.duree_jours),

    statut: ({
      A_VENIR: "À venir",
      EN_COURS: "En cours",
      TERMINEE: "Terminée",
      ANNULEE: "Annulée",
      EN_ATTENTE: "À venir",
      CONFIRMEE: "À venir",
      REPORTEE: "À venir",
      TRANSFORMEE_EN_LOCATION: "En cours",
      EXPIREE: "Annulée",
    }[statut] ?? "Annulée") as Reservation["statut"],

    dateReservation: strNull(r.date_reservation)?.slice(0, 10) ?? undefined,

    dateFin: strNull(r.date_fin ?? r.date_fin_prevue)?.slice(0, 10) ?? null,

    mission: strNull(r.mission),

    lieuMission: strNull(r.lieu_mission),

    statutConfirmation: strNull(r.statut_confirmation_import),

    statutFacturation: strNull(r.statut_facturation),

    statutPaiement: str(r.statut_paiement) as Reservation["statutPaiement"],

    clientImport: strNull(r.client_import),

    commercialImport: strNull(r.commercial_import),
  }
}

async function query<T>(
  pool: mysql.Pool | mysql.PoolConnection,

  sql: string,

  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query(sql, params)

  return rows as T[]
}

// Série mensuelle de référence (cf. memory) : remplacée par un GROUP BY

// mensuel quand l'historique des locations sera alimenté en production.

const MONTHLY_REFERENCE: MonthlyPoint[] = [
  { mois: "Jan", courte: 45, longue: 26 },

  { mois: "Fév", courte: 52, longue: 31 },

  { mois: "Mar", courte: 65, longue: 38 },

  { mois: "Avr", courte: 58, longue: 42 },

  { mois: "Mai", courte: 78, longue: 48 },

  { mois: "Juin", courte: 88, longue: 56 },
]

class MysqlAdminRepo implements AdminRepo {
  constructor(private pool: mysql.Pool) {}

  async list(): Promise<Admin[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_administrateur AS id, nom, prenom, email,
              role, actif AS active
         FROM administrateur
        ORDER BY prenom, nom, id_administrateur`,
    )

    return rows.map((row) => ({
      id: num(row.id),
      nom: str(row.nom),
      prenom: str(row.prenom),
      email: str(row.email),
      role: mapAdminRole(row.role),
      active: Boolean(row.active),
    }))
  }

  async findByEmail(email: string): Promise<AdminRecord | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_administrateur AS id, nom, prenom,
              email, role, actif AS active,
              mot_de_passe_hash AS password_hash
         FROM administrateur
        WHERE email = ? AND actif = TRUE`,

      [email.trim()],
    )

    const r = rows[0]

    if (!r) return null

    return {
      id: num(r.id),

      nom: str(r.nom),

      prenom: str(r.prenom),

      email: str(r.email),

      role: mapAdminRole(r.role),

      active: Boolean(r.active),

      passwordHash: str(r.password_hash),
    }
  }

  async findById(id: number): Promise<Admin | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_administrateur AS id, nom, prenom, email,
              role, actif AS active
         FROM administrateur
        WHERE id_administrateur = ? AND actif = TRUE`,

      [id],
    )

    const r = rows[0]

    if (!r) return null

    return {
      id: num(r.id),
      nom: str(r.nom),
      prenom: str(r.prenom),
      email: str(r.email),
      role: mapAdminRole(r.role),
      active: Boolean(r.active),
    }
  }

  async findRecordById(id: number): Promise<AdminRecord | null> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_administrateur AS id, nom, prenom, email,
              role, actif AS active,
              mot_de_passe_hash AS password_hash
         FROM administrateur
        WHERE id_administrateur = ? AND actif = TRUE`,
      [id],
    )

    const r = rows[0]
    if (!r) return null

    return {
      id: num(r.id),
      nom: str(r.nom),
      prenom: str(r.prenom),
      email: str(r.email),
      role: mapAdminRole(r.role),
      active: Boolean(r.active),
      passwordHash: str(r.password_hash),
    }
  }

  async updateProfile(
    id: number,
    input: AdminProfileInput,
  ): Promise<Admin | null> {
    await this.pool.query(
      `UPDATE administrateur
          SET nom = ?, prenom = ?, email = ?,
              mot_de_passe_hash = COALESCE(?, mot_de_passe_hash)
        WHERE id_administrateur = ? AND actif = TRUE`,
      [
        input.nom,
        input.prenom,
        input.email,
        input.passwordHash ?? null,
        id,
      ],
    )

    return this.findById(id)
  }

  async create(input: AdminCreateInput): Promise<Admin> {
    const login = input.email.split("@", 1)[0].slice(0, 60)
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      `INSERT INTO administrateur
         (nom, prenom, email, login, mot_de_passe_hash, actif, role)
       VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
      [
        input.nom,
        input.prenom,
        input.email,
        login,
        input.passwordHash,
        input.role,
      ],
    )

    const admin = await this.findById(result.insertId)
    if (!admin) throw new Error("Le compte administrateur créé est introuvable")
    return admin
  }
}

class MysqlAgenceRepo implements AgenceRepo {
  constructor(private pool: mysql.Pool) {}

  private select =
    "SELECT id_agence AS id, code, nom, adresse, telephone, actif FROM agence"

  async list(options?: ListOptions): Promise<Agence[]> {
    let sql = this.select

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " WHERE code LIKE ? OR nom LIKE ? OR adresse LIKE ? OR telephone LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like, like, like)
    }

    sql += " ORDER BY nom"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map((row) => ({
      id: num(row.id),

      code: str(row.code),

      nom: str(row.nom),

      adresse: strNull(row.adresse),

      telephone: strNull(row.telephone),

      actif: Boolean(row.actif),
    }))
  }

  async get(id: number): Promise<Agence | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE id_agence = ?`,
      [id],
    )

    const row = rows[0]

    return row
      ? {
          id: num(row.id),

          code: str(row.code),

          nom: str(row.nom),

          adresse: strNull(row.adresse),

          telephone: strNull(row.telephone),

          actif: Boolean(row.actif),
        }
      : null
  }

  async create(input: AgenceInput): Promise<Agence> {
    const [result] = await this.pool.query(
      "INSERT INTO agence (code, nom, adresse, telephone, actif) VALUES (?, ?, ?, ?, ?)",

      [input.code, input.nom, input.adresse, input.telephone, input.actif],
    )

    const created = await this.get(
      Number((result as mysql.ResultSetHeader).insertId),
    )

    if (!created) throw new Error("Agence créée mais introuvable")

    return created
  }

  async update(
    id: number,
    input: Partial<AgenceInput>,
  ): Promise<Agence | null> {
    const fields: Array<[keyof AgenceInput, string]> = [
      ["code", "code"],

      ["nom", "nom"],

      ["adresse", "adresse"],

      ["telephone", "telephone"],

      ["actif", "actif"],
    ]

    const sets: string[] = []

    const params: unknown[] = []

    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`)

        params.push(input[key] ?? null)
      }
    }

    if (sets.length > 0) {
      params.push(id)

      await this.pool.query(
        `UPDATE agence SET ${sets.join(", ")} WHERE id_agence = ?`,
        params,
      )
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM agence WHERE id_agence = ?",
      [id],
    )

    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlCategorieRepo implements CategorieVehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<CategorieVehicule[]> {
    let sql =
      "SELECT id_categorie AS id, libelle, tarif_journalier, tarif_mensuel FROM categorie_vehicule"

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE libelle LIKE ?"

      params.push(`%${options.q.trim()}%`)
    }

    sql += " ORDER BY libelle"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map((r) => ({
      id: num(r.id),

      libelle: str(r.libelle),

      tarifJournalier: num(r.tarif_journalier),

      tarifMensuel: numNull(r.tarif_mensuel),
    }))
  }

  async get(id: number): Promise<CategorieVehicule | null> {
    const rows = await query<Row>(
      this.pool,

      "SELECT id_categorie AS id, libelle, tarif_journalier, tarif_mensuel FROM categorie_vehicule WHERE id_categorie = ?",

      [id],
    )

    const r = rows[0]

    return r
      ? {
          id: num(r.id),

          libelle: str(r.libelle),

          tarifJournalier: num(r.tarif_journalier),

          tarifMensuel: numNull(r.tarif_mensuel),
        }
      : null
  }

  async create(input: CategorieVehiculeInput): Promise<CategorieVehicule> {
    const [result] = await this.pool.query(
      "INSERT INTO categorie_vehicule (libelle, tarif_journalier, tarif_mensuel) VALUES (?, ?, ?)",

      [input.libelle, input.tarifJournalier, input.tarifMensuel],
    )

    return (await this.get(Number((result as mysql.ResultSetHeader).insertId)))!
  }

  async update(
    id: number,

    input: Partial<CategorieVehiculeInput>,
  ): Promise<CategorieVehicule | null> {
    const sets: string[] = []

    const params: unknown[] = []

    if (input.libelle !== undefined) {
      sets.push("libelle = ?")

      params.push(input.libelle)
    }

    if (input.tarifJournalier !== undefined) {
      sets.push("tarif_journalier = ?")

      params.push(input.tarifJournalier)
    }

    if (input.tarifMensuel !== undefined) {
      sets.push("tarif_mensuel = ?")

      params.push(input.tarifMensuel)
    }

    if (sets.length > 0) {
      params.push(id)

      await this.pool.query(
        `UPDATE categorie_vehicule SET ${sets.join(", ")} WHERE id_categorie = ?`,

        params,
      )
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM categorie_vehicule WHERE id_categorie = ?",

      [id],
    )

    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlGarageRepo implements GarageRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Garage[]> {
    let sql = "SELECT id_garage AS id, nom, adresse, telephone FROM garage"

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE nom LIKE ? OR adresse LIKE ? OR telephone LIKE ?"

      params.push(
        `%${options.q.trim()}%`,
        `%${options.q.trim()}%`,
        `%${options.q.trim()}%`,
      )
    }

    sql += " ORDER BY nom"

    return query<Row>(this.pool, sql, params).then((rows) =>
      rows.map((row) => ({
        id: num(row.id),
        nom: str(row.nom),
        adresse: strNull(row.adresse),
        telephone: strNull(row.telephone),
      })),
    )
  }

  async get(id: number): Promise<Garage | null> {
    const rows = await query<Row>(
      this.pool,
      "SELECT id_garage AS id, nom, adresse, telephone FROM garage WHERE id_garage = ?",
      [id],
    )

    const row = rows[0]

    return row
      ? {
          id: num(row.id),
          nom: str(row.nom),
          adresse: strNull(row.adresse),
          telephone: strNull(row.telephone),
        }
      : null
  }

  async create(input: GarageInput): Promise<Garage> {
    const [result] = await this.pool.query(
      "INSERT INTO garage (nom, adresse, telephone) VALUES (?, ?, ?)",

      [input.nom, input.adresse ?? null, input.telephone ?? null],
    )

    return (await this.get(Number((result as mysql.ResultSetHeader).insertId)))!
  }

  async update(
    id: number,
    input: Partial<GarageInput>,
  ): Promise<Garage | null> {
    const sets: string[] = []

    const params: unknown[] = []

    const fields: Array<[keyof GarageInput, string]> = [
      ["nom", "nom"],

      ["adresse", "adresse"],

      ["telephone", "telephone"],
    ]

    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`)

        params.push(input[key])
      }
    }

    if (sets.length)
      await this.pool.query(
        `UPDATE garage SET ${sets.join(", ")} WHERE id_garage = ?`,
        [...params, id],
      )

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM garage WHERE id_garage = ?",
      [id],
    )

    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }
}

function mapPassageGarage(r: Row): PassageGarage {
  return {
    id: num(r.id),

    typePassage: r.type_passage as PassageGarage["typePassage"],

    dateEntree: str(r.date_entree),

    dateSortiePrevue: r.date_sortie_prevue
      ? str(r.date_sortie_prevue)
      : null,

    dateSortieReelle: r.date_sortie_reelle
      ? str(r.date_sortie_reelle)
      : null,

    kmEntree: numNull(r.km_entree),

    kmSortie: numNull(r.km_sortie),

    motif: strNull(r.motif),

    statut: r.statut as PassageGarage["statut"],

    coutTotal: num(r.cout_total),

    vehiculeId: num(r.vehicule_id),

    garageId: num(r.garage_id),

    vehicule: strNull(r.vehicule),

    garage: strNull(r.garage),

    vehiculeRemplacementId: numNull(r.vehicule_remplacement_id),
  }
}

function mapReparation(r: Row): Reparation {
  return {
    id: num(r.id),

    description: str(r.description),

    dateReparation: str(r.date_reparation),

    cout: num(r.cout),

    passageId: num(r.passage_id),

    vehicule: strNull(r.vehicule),
  }
}

class MysqlReparationRepo implements ReparationRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `SELECT r.id_reparation AS id, r.description, r.date_reparation,
                           r.cout, r.id_passage AS passage_id,
                           v.immatriculation AS vehicule
                      FROM reparation r
                      JOIN passage_garage p ON p.id_passage = r.id_passage
                      LEFT JOIN vehicule v ON v.id_vehicule = p.id_vehicule`

  async list(options?: ListOptions): Promise<Reparation[]> {
    await this.pool.query(
      `INSERT INTO reparation (description, date_reparation, cout, id_passage)
       SELECT COALESCE(NULLIF(p.motif, ''), 'Réparation effectuée au garage'),
              COALESCE(p.date_sortie_reelle, CURRENT_TIMESTAMP),
              p.cout_total,
              p.id_passage
         FROM passage_garage p
         LEFT JOIN reparation r ON r.id_passage = p.id_passage
        WHERE p.statut = 'TERMINEE' AND r.id_reparation IS NULL`,
    )

    let sql = this.select

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE r.description LIKE ? OR v.immatriculation LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY r.date_reparation DESC, r.id_reparation DESC"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapReparation)
  }

  async get(id: number): Promise<Reparation | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE r.id_reparation = ?`,
      [id],
    )

    return rows[0] ? mapReparation(rows[0]) : null
  }

  async update(
    id: number,
    input: Partial<ReparationInput>,
  ): Promise<Reparation | null> {
    const sets: string[] = []

    const params: unknown[] = []

    if (input.description !== undefined) {
      sets.push("description = ?")

      params.push(input.description)
    }

    if (input.cout !== undefined) {
      sets.push("cout = ?")

      params.push(input.cout)
    }

    if (sets.length) {
      await this.pool.query(
        `UPDATE reparation SET ${sets.join(", ")} WHERE id_reparation = ?`,
        [...params, id],
      )
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM reparation WHERE id_reparation = ?",
      [id],
    )

    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }
}

class MysqlPassageGarageRepo implements PassageGarageRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `SELECT p.id_passage AS id, p.type_passage, p.date_entree,
                           p.date_sortie_prevue, p.date_sortie_reelle, p.km_entree,
                           (SELECT m.kilometrage FROM mouvement_vehicule m
                             WHERE m.id_passage = p.id_passage
                               AND m.type_mouvement = 'RETOUR_GARAGE'
                             ORDER BY m.id_mouvement DESC LIMIT 1) AS km_sortie,
                           p.motif, p.statut, p.cout_total,
                           p.id_vehicule AS vehicule_id, p.id_garage AS garage_id,
                           v.immatriculation AS vehicule, g.nom AS garage,
                           p.id_vehicule_remplacement AS vehicule_remplacement_id
                      FROM passage_garage p
                      LEFT JOIN vehicule v ON v.id_vehicule = p.id_vehicule
                      JOIN garage g ON g.id_garage = p.id_garage`

  async list(options?: ListOptions): Promise<PassageGarage[]> {
    let sql = this.select

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " WHERE v.immatriculation LIKE ? OR g.nom LIKE ? OR p.type_passage LIKE ? OR p.statut LIKE ? OR p.motif LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like, like, like, like)
    }

    sql += " ORDER BY p.date_entree DESC, p.id_passage DESC"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapPassageGarage)
  }

  async get(id: number): Promise<PassageGarage | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE p.id_passage = ?`,
      [id],
    )

    return rows[0] ? mapPassageGarage(rows[0]) : null
  }

  async update(
    id: number,
    input: Partial<PassageGarageInput>,
  ): Promise<PassageGarage | null> {
    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      const [currentRows] = (await connection.query(
        "SELECT id_vehicule, statut, motif, km_entree, date_entree, date_sortie_prevue, date_sortie_reelle FROM passage_garage WHERE id_passage = ? FOR UPDATE",

        [id],
      )) as unknown as [Row[], unknown]

      const current = currentRows[0]

      if (!current) {
        await connection.rollback()

        return null
      }

      if (input.statut === "TERMINEE") {
        if (input.kmSortie === undefined || input.kmSortie === null) {
          throw badRequest("Le kilométrage de retour est obligatoire pour terminer le passage.")
        }
        if (current.km_entree !== null && input.kmSortie < num(current.km_entree)) {
          throw badRequest("Le kilométrage de retour ne peut pas être inférieur au kilométrage d'entrée.")
        }
      }

      const columns: Array<[keyof PassageGarageInput, string]> = [
        ["typePassage", "type_passage"],

        ["dateEntree", "date_entree"],

        ["dateSortiePrevue", "date_sortie_prevue"],

        ["dateSortieReelle", "date_sortie_reelle"],

        ["kmEntree", "km_entree"],

        ["motif", "motif"],

        ["statut", "statut"],

        ["coutTotal", "cout_total"],

        ["vehiculeId", "id_vehicule"],

        ["garageId", "id_garage"],

        ["vehiculeRemplacementId", "id_vehicule_remplacement"],
      ]

      const sets: string[] = []

      const params: unknown[] = []

      for (const [key, column] of columns) {
        if (input[key] !== undefined) {
          sets.push(`${column} = ?`)

          let value = input[key] ?? null
          if (key === "dateSortieReelle" && input.statut === "TERMINEE") {
            value = localSqlDateTimeNow()
          } else if (
            (key === "dateEntree" ||
              key === "dateSortiePrevue" ||
              key === "dateSortieReelle") &&
            typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(value)
          ) {
            const existingValue =
              key === "dateEntree"
                ? current.date_entree
                : key === "dateSortiePrevue"
                  ? current.date_sortie_prevue
                  : current.date_sortie_reelle
            const existingText = existingValue ? String(existingValue) : ""
            value = `${value} ${existingText.slice(11, 19) || "00:00:00"}`
          } else if (
            (key === "dateEntree" ||
              key === "dateSortiePrevue" ||
              key === "dateSortieReelle") &&
            typeof value === "string"
          ) {
            value = sqlDateTime(value)
          }
          params.push(value)
        }
      }

      if (sets.length) {
        await connection.query(
          `UPDATE passage_garage SET ${sets.join(", ")} WHERE id_passage = ?`,
          [...params, id],
        )
      }

      if (input.statut === "TERMINEE") {
        const dateSortie = localSqlDateTimeNow()

        await connection.query(
          "UPDATE passage_garage SET date_sortie_reelle = ? WHERE id_passage = ?",

          [dateSortie, id],
        )

        const returnMovements = await query<Row>(
          connection,
          `SELECT id_mouvement AS id
             FROM mouvement_vehicule
            WHERE id_passage = ? AND type_mouvement = 'RETOUR_GARAGE'
            ORDER BY id_mouvement DESC
            LIMIT 1`,
          [id],
        )
        if (!returnMovements[0]) {
          throw new Error("Le mouvement de retour du garage n'a pas été créé.")
        }
        await connection.query(
          "UPDATE mouvement_vehicule SET kilometrage = ? WHERE id_mouvement = ?",
          [input.kmSortie, num(returnMovements[0].id)],
        )
        await connection.query(
          "UPDATE vehicule SET kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",
          [input.kmSortie, num(current.id_vehicule)],
        )

        if (current.statut !== "TERMINEE") {
          const [repairRows] = (await connection.query(
            "SELECT id_reparation FROM reparation WHERE id_passage = ? LIMIT 1",

            [id],
          )) as unknown as [Row[], unknown]

          if (!repairRows[0]) {
            await connection.query(
              `INSERT INTO reparation (description, date_reparation, cout, id_passage)
             VALUES (?, ?, ?, ?)`,

              [
                input.motif ??
                  current.motif ??
                  "Réparation effectuée au garage",

                new Date(),

                input.coutTotal ?? 0,

                id,
              ],
            )
          }
        }
      }

      await connection.commit()

      return this.get(id)
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }

  async remove(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      const [currentRows] = (await connection.query(
        "SELECT id_passage FROM passage_garage WHERE id_passage = ? FOR UPDATE",

        [id],
      )) as unknown as [Row[], unknown]

      if (!currentRows[0]) {
        await connection.rollback()

        return false
      }

      await connection.query(
        "UPDATE mouvement_vehicule SET id_passage = NULL WHERE id_passage = ?",

        [id],
      )

      const [result] = await connection.query(
        "DELETE FROM passage_garage WHERE id_passage = ?",

        [id],
      )

      await connection.commit()

      return Number((result as mysql.ResultSetHeader).affectedRows) > 0
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }
}

class MysqlModeleRepo implements ModeleVehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `SELECT m.id_modele AS id, m.marque, m.nom, m.nb_places,
                           m.id_categorie AS categorie_id, c.libelle AS categorie
                      FROM modele_vehicule m
                 LEFT JOIN categorie_vehicule c ON c.id_categorie = m.id_categorie`

  async list(options?: ListOptions): Promise<ModeleVehicule[]> {
    let sql = this.select

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE m.marque LIKE ? OR m.nom LIKE ? OR c.libelle LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like, like)
    }

    sql += " ORDER BY m.marque, m.nom"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map((r) => ({
      id: num(r.id),

      marque: str(r.marque),

      nom: str(r.nom),

      nbPlaces: numNull(r.nb_places),

      categorieId: numNull(r.categorie_id),

      categorie: strNull(r.categorie),
    }))
  }

  async get(id: number): Promise<ModeleVehicule | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE m.id_modele = ?`,
      [id],
    )

    const r = rows[0]

    return r
      ? {
          id: num(r.id),

          marque: str(r.marque),

          nom: str(r.nom),

          nbPlaces: numNull(r.nb_places),

          categorieId: numNull(r.categorie_id),

          categorie: strNull(r.categorie),
        }
      : null
  }

  async create(input: ModeleVehiculeInput): Promise<ModeleVehicule> {
    const [result] = await this.pool.query(
      "INSERT INTO modele_vehicule (marque, nom, nb_places, id_categorie) VALUES (?, ?, ?, ?)",

      [input.marque, input.nom, input.nbPlaces, input.categorieId],
    )

    return (await this.get(Number((result as mysql.ResultSetHeader).insertId)))!
  }

  async update(
    id: number,
    input: Partial<ModeleVehiculeInput>,
  ): Promise<ModeleVehicule | null> {
    const sets: string[] = []

    const params: unknown[] = []

    if (input.marque !== undefined) {
      sets.push("marque = ?")

      params.push(input.marque)
    }

    if (input.nom !== undefined) {
      sets.push("nom = ?")

      params.push(input.nom)
    }

    if (input.nbPlaces !== undefined) {
      sets.push("nb_places = ?")

      params.push(input.nbPlaces)
    }

    if (input.categorieId !== undefined) {
      sets.push("id_categorie = ?")

      params.push(input.categorieId)
    }

    if (sets.length > 0) {
      params.push(id)

      await this.pool.query(
        `UPDATE modele_vehicule SET ${sets.join(", ")} WHERE id_modele = ?`,
        params,
      )
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM modele_vehicule WHERE id_modele = ?",
      [id],
    )

    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlCentreRepo implements CentreRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `SELECT ce.id_centre AS id, ce.nom, ce.type_centre, ce.id_client,
                           cl.nom AS client
                      FROM centre ce
                 LEFT JOIN client cl ON cl.id_client = ce.id_client`

  async list(): Promise<Centre[]> {
    const rows = await query<Row>(this.pool, `${this.select} ORDER BY ce.nom`)

    return rows.map((r) => ({
      id: num(r.id),

      nom: str(r.nom),

      typeCentre: str(r.type_centre) as Centre["typeCentre"],

      clientId: numNull(r.id_client),

      client: strNull(r.client),
    }))
  }

  async get(id: number): Promise<Centre | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE ce.id_centre = ?`,
      [id],
    )

    const row = rows[0]

    return row
      ? {
          id: num(row.id),

          nom: str(row.nom),

          typeCentre: str(row.type_centre) as Centre["typeCentre"],

          clientId: numNull(row.id_client),

          client: strNull(row.client),
        }
      : null
  }

  async create(input: CentreInput): Promise<Centre> {
    const [result] = await this.pool.query(
      "INSERT INTO centre (nom, type_centre, id_client) VALUES (?, ?, ?)",

      [input.nom, input.typeCentre, input.clientId],
    )

    return (await this.get(Number((result as mysql.ResultSetHeader).insertId)))!
  }

  async update(
    id: number,
    input: Partial<CentreInput>,
  ): Promise<Centre | null> {
    const fields: Array<[keyof CentreInput, string]> = [
      ["nom", "nom"],

      ["typeCentre", "type_centre"],

      ["clientId", "id_client"],
    ]

    const sets: string[] = []

    const params: unknown[] = []

    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`)

        params.push(input[key] ?? null)
      }
    }

    if (sets.length > 0) {
      params.push(id)

      await this.pool.query(
        `UPDATE centre SET ${sets.join(", ")} WHERE id_centre = ?`,
        params,
      )
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM centre WHERE id_centre = ?",
      [id],
    )

    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlConducteurRepo implements ConducteurRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `
    SELECT c.id_conducteur AS id, c.nom, c.prenom, c.telephone,
           c.num_permis AS numPermis, c.categorie,
           c.id_client AS clientId, cl.nom AS client
    FROM conducteur c
    LEFT JOIN client cl ON cl.id_client = c.id_client
  `

  async list(options?: ListOptions): Promise<Conducteur[]> {
    const params: unknown[] = []
    let sql = this.select
    if (options?.q) {
      sql +=
        " WHERE c.nom LIKE ? OR c.prenom LIKE ? OR c.telephone LIKE ? OR c.num_permis LIKE ? OR c.categorie LIKE ? OR cl.nom LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like, like, like, like, like)
    }
    sql += " ORDER BY c.nom, c.prenom"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map((row) => ({
      id: num(row.id),
      nom: str(row.nom),
      prenom: strNull(row.prenom),
      telephone: strNull(row.telephone),
      numPermis: strNull(row.numPermis),
      categorie: row.categorie as Conducteur["categorie"],
      clientId: numNull(row.clientId),
      client: strNull(row.client),
    }))
  }

  async get(id: number): Promise<Conducteur | null> {
    const rows = await query<Row>(
      this.pool,
      `${this.select} WHERE c.id_conducteur = ?`,
      [id],
    )
    const row = rows[0]
    return row
      ? {
          id: num(row.id),
          nom: str(row.nom),
          prenom: strNull(row.prenom),
          telephone: strNull(row.telephone),
          numPermis: strNull(row.numPermis),
          categorie: row.categorie as Conducteur["categorie"],
          clientId: numNull(row.clientId),
          client: strNull(row.client),
        }
      : null
  }

  async create(input: ConducteurInput): Promise<Conducteur> {
    const [result] = await this.pool.query(
      "INSERT INTO conducteur (nom, prenom, telephone, num_permis, categorie, id_client) VALUES (?, ?, ?, ?, ?, ?)",
      [
        input.nom,
        input.prenom ?? null,
        input.telephone ?? null,
        input.numPermis ?? null,
        input.categorie,
        input.clientId ?? null,
      ],
    )
    const created = await this.get(
      Number((result as mysql.ResultSetHeader).insertId),
    )
    if (!created) throw new Error("Conducteur créé mais introuvable")
    return created
  }

  async update(
    id: number,
    input: Partial<ConducteurInput>,
  ): Promise<Conducteur | null> {
    const fields: Array<[keyof ConducteurInput, string]> = [
      ["nom", "nom"],
      ["prenom", "prenom"],
      ["telephone", "telephone"],
      ["numPermis", "num_permis"],
      ["categorie", "categorie"],
      ["clientId", "id_client"],
    ]
    const updates: string[] = []
    const params: unknown[] = []
    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        updates.push(`${column} = ?`)
        params.push(input[key] ?? null)
      }
    }
    if (updates.length === 0) return this.get(id)
    params.push(id)
    await this.pool.query(
      `UPDATE conducteur SET ${updates.join(", ")} WHERE id_conducteur = ?`,
      params,
    )
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM conducteur WHERE id_conducteur = ?",
      [id],
    )
    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlVehiculeRepo implements VehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Vehicule[]> {
    let sql = `SELECT v.id_vehicule AS id, v.*, c.nom AS centre
                 FROM vehicule v
            LEFT JOIN centre c ON c.id_centre = v.id_centre`

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " WHERE v.immatriculation LIKE ? OR v.marque LIKE ? OR v.modele LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like, like)
    }

    sql += " ORDER BY v.id_vehicule"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapVehicule)
  }

  async get(id: number): Promise<Vehicule | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT v.id_vehicule AS id, v.*, c.nom AS centre FROM vehicule v LEFT JOIN centre c ON c.id_centre = v.id_centre
       WHERE v.id_vehicule = ?`,

      [id],
    )

    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async findByImmatriculation(immat: string): Promise<Vehicule | null> {
    const normalized = immat.trim().replace(/[\s-]/g, "").toUpperCase()

    const rows = await query<Row>(
      this.pool,

      `SELECT v.id_vehicule AS id, v.*, c.nom AS centre FROM vehicule v LEFT JOIN centre c ON c.id_centre = v.id_centre
       WHERE v.immatriculation_normalisee = ?`,

      [normalized],
    )

    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async create(input: VehiculeInput, adminId: number): Promise<Vehicule> {
    const [result] = await this.pool.query(
      `INSERT INTO vehicule
       (immatriculation, marque, modele, version, annee, numero_chassis, couleur, carburant,
        nb_places, kilometrage, segment_parc, groupe_geolocalisation, id_centre,
        date_mise_en_service, date_entree_parc, prix_achat, date_achat, date_prochaine_visite_technique,
        date_expiration_assurance, observation, id_categorie, id_administrateur)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        input.immatriculation,
        input.marque,
        input.modele,
        input.version ?? null,
        input.annee ?? null,

        input.numeroChassis ?? null,
        input.couleur ?? null,
        input.carburant ?? null,
        input.nbPlaces ?? null,

        input.kilometrage,
        input.segmentParc,
        input.groupeGeolocalisation ?? null,
        input.centreId ?? null,

        input.dateMiseEnService ?? null,
        input.dateEntreeParc ?? null,
        input.prixAchat ?? null,
        input.dateAchat ?? null,
        input.dateProchaineVisiteTechnique ?? null,

        input.dateExpirationAssurance ?? null,
        input.observation ?? null,
        input.categorieId,
        adminId,
      ],
    )

    const id = (result as mysql.ResultSetHeader).insertId

    const created = await this.get(id)

    if (!created) throw new Error("Véhicule créé introuvable")

    return created
  }

  async importMany(inputs: VehiculeInput[], adminId: number): Promise<{
    created: number
    updated: number
  }> {
    const connection = await this.pool.getConnection()

    let created = 0

    let updated = 0

    try {
      await connection.beginTransaction()

      for (const input of inputs) {
        const normalizedImmatriculation = input.immatriculation
          .trim()
          .replace(/[\s-]/g, "")
          .toUpperCase()

        const [existingRows] = (await connection.query(
          `SELECT id_vehicule FROM vehicule
            WHERE immatriculation_normalisee = ?
            LIMIT 1 FOR UPDATE`,

          [normalizedImmatriculation],
        )) as unknown as [Row[], unknown]

        const existingId = existingRows[0]
          ? num(existingRows[0].id_vehicule)
          : null

        if (input.numeroChassis) {
          const [chassisRows] = (await connection.query(
            `SELECT id_vehicule FROM vehicule
              WHERE numero_chassis = ?
                AND (? IS NULL OR id_vehicule <> ?)
              LIMIT 1`,

            [input.numeroChassis, existingId, existingId],
          )) as unknown as [Row[], unknown]

          if (chassisRows[0]) {
            throw new Error(
              `Le numéro de châssis ${input.numeroChassis} est déjà associé à un autre véhicule.`,
            )
          }
        }

        if (existingId !== null) {
          await connection.query(
            `UPDATE vehicule
                SET immatriculation = ?, marque = ?, modele = ?, version = ?,
                    numero_chassis = ?, carburant = ?, kilometrage = ?, id_centre = ?,
                    date_mise_en_service = ?, date_prochaine_visite_technique = ?,
                    date_expiration_assurance = ?, observation = ?, id_categorie = ?
              WHERE id_vehicule = ?`,

            [
              input.immatriculation,

              input.marque,

              input.modele,

              input.version ?? null,

              input.numeroChassis ?? null,

              input.carburant ?? null,

              input.kilometrage,

              input.centreId ?? null,

              input.dateMiseEnService ?? null,

              input.dateProchaineVisiteTechnique ?? null,

              input.dateExpirationAssurance ?? null,

              input.observation ?? null,

              input.categorieId ?? null,

              existingId,
            ],
          )

          updated += 1
        } else {
          await connection.query(
            `INSERT INTO vehicule
              (immatriculation, marque, modele, version, numero_chassis, carburant,
               kilometrage, segment_parc, id_centre, date_mise_en_service,
               date_prochaine_visite_technique, date_expiration_assurance,
               observation, id_categorie, id_administrateur)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'LCD', ?, ?, ?, ?, ?, ?, ?)`,

            [
              input.immatriculation,

              input.marque,

              input.modele,

              input.version ?? null,

              input.numeroChassis ?? null,

              input.carburant ?? null,

              input.kilometrage,

              input.centreId ?? null,

              input.dateMiseEnService ?? null,

              input.dateProchaineVisiteTechnique ?? null,

              input.dateExpirationAssurance ?? null,

              input.observation ?? null,

              input.categorieId ?? null,

              adminId,
            ],
          )

          created += 1
        }
      }

      await connection.commit()

      return { created, updated }
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }

  async update(
    id: number,
    input: Partial<VehiculeInput>,
  ): Promise<Vehicule | null> {
    const sets: string[] = []

    const params: unknown[] = []

    const fields: Array<[keyof VehiculeInput, string]> = [
      ["immatriculation", "immatriculation"],
      ["marque", "marque"],
      ["modele", "modele"],

      ["version", "version"],
      ["annee", "annee"],
      ["numeroChassis", "numero_chassis"],

      ["couleur", "couleur"],
      ["carburant", "carburant"],
      ["nbPlaces", "nb_places"],

      ["kilometrage", "kilometrage"],
      ["segmentParc", "segment_parc"],

      ["groupeGeolocalisation", "groupe_geolocalisation"],
      ["centreId", "id_centre"],

      ["dateMiseEnService", "date_mise_en_service"],
      ["dateEntreeParc", "date_entree_parc"],

      ["prixAchat", "prix_achat"],
      ["dateAchat", "date_achat"],

      ["dateProchaineVisiteTechnique", "date_prochaine_visite_technique"],

      ["dateExpirationAssurance", "date_expiration_assurance"],
      ["observation", "observation"],

      ["categorieId", "id_categorie"],
    ]

    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`)

        params.push(input[key] ?? null)
      }
    }

    if (sets.length === 0) return this.get(id)

    await this.pool.query(
      `UPDATE vehicule SET ${sets.join(", ")} WHERE id_vehicule = ?`,
      [...params, id],
    )

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM vehicule WHERE id_vehicule = ?",
      [id],
    )

    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlClientRepo implements ClientRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Client[]> {
    let sql = `SELECT id_client AS id, nom AS nom_famille, prenom,
                      CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
                      type_client AS type, telephone
                 FROM client`

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " WHERE CONCAT_WS(' ', NULLIF(prenom, ''), nom) LIKE ? OR telephone LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY id_client"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    const rows = await query<Row>(this.pool, sql, params)

    return rows.map((r) => ({
      id: num(r.id),

      nom: str(r.nom),

      nomFamille: str(r.nom_famille),

      prenom: strNull(r.prenom),

      type: r.type as Client["type"],

      telephone: str(r.telephone),
    }))
  }

  async get(id: number): Promise<Client | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_client AS id, nom AS nom_famille, prenom,
              CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              type_client AS type, telephone
         FROM client WHERE id_client = ?`,

      [id],
    )

    const r = rows[0]

    if (!r) return null

    return {
      id: num(r.id),

      nom: str(r.nom),

      nomFamille: str(r.nom_famille),

      prenom: strNull(r.prenom),

      type: r.type as Client["type"],

      telephone: str(r.telephone),
    }
  }

  async fiches(): Promise<ClientFiche[]> {
    const rows = await query<Row>(
      this.pool,

      `SELECT c.id_client AS id,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS nom,
              c.nom AS nom_famille, c.prenom,
              c.type_client AS type, c.telephone, c.email, c.adresse,
              c.num_permis,
              COUNT(l.id_location) AS locations_count,
              MAX(l.date_fin_prevue) AS derniere
         FROM client c
         LEFT JOIN location l ON l.id_client = c.id_client
        GROUP BY c.id_client, c.nom, c.prenom, c.type_client, c.telephone,
                 c.email, c.adresse, c.num_permis
        ORDER BY c.id_client`,
    )

    return rows.map((r) => ({
      id: num(r.id),

      nom: str(r.nom),

      nomFamille: str(r.nom_famille),

      prenom: strNull(r.prenom),

      type: mapClientType(r.type),

      telephone: str(r.telephone),

      email: strNull(r.email),

      adresse: strNull(r.adresse),

      numPermis: strNull(r.num_permis),

      locationsCount: num(r.locations_count),

      derniereOperation: r.derniere
        ? str(r.derniere).slice(0, 10).split("-").reverse().join("/")
        : null,
    }))
  }

  async create(input: ClientInput, adminId: number): Promise<Client> {
    const [result] = await this.pool.query(
      `INSERT INTO client
         (nom, prenom, type_client, telephone, email, adresse, num_permis, id_administrateur)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        input.nom,

        input.prenom ?? null,

        input.type.toUpperCase(),

        input.telephone,

        input.email || null,

        input.adresse || null,

        input.numPermis || null,

        adminId,
      ],
    )

    const created = await this.get((result as mysql.ResultSetHeader).insertId)

    if (!created) throw new Error("Client créé mais introuvable")

    return created
  }

  async update(id: number, input: ClientUpdateInput): Promise<Client | null> {
    await this.pool.query(
      `UPDATE client
          SET nom = ?, prenom = ?, type_client = ?, telephone = ?, email = ?,
              adresse = ?, num_permis = ?
        WHERE id_client = ?`,

      [
        input.nom,

        input.prenom || null,

        input.type.toUpperCase(),

        input.telephone,

        input.email || null,

        input.adresse || null,

        input.numPermis || null,

        id,
      ],
    )

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM client WHERE id_client = ?",
      [id],
    )

    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlCommercialRepo implements CommercialRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Commercial[]> {
    let sql = `SELECT id_commercial AS id, CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
                      telephone AS contact, id_agence AS agenceId
                 FROM commercial
                WHERE actif = TRUE`

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " AND (CONCAT_WS(' ', NULLIF(prenom, ''), nom) LIKE ? OR telephone LIKE ?)"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY id_commercial"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    const rows = await query<Row>(this.pool, sql, params)

    return rows.map((r) => ({
      id: num(r.id),

      nom: str(r.nom),

      contact: str(r.contact),

      agenceId: r.agenceId == null ? null : num(r.agenceId),
    }))
  }

  async get(id: number): Promise<Commercial | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_commercial AS id, CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              telephone AS contact, id_agence AS agenceId
         FROM commercial WHERE id_commercial = ? AND actif = TRUE`,

      [id],
    )

    const r = rows[0]

    if (!r) return null

    return {
      id: num(r.id),

      nom: str(r.nom),

      contact: str(r.contact),

      agenceId: r.agenceId == null ? null : num(r.agenceId),
    }
  }

  async fiches(): Promise<CommercialFiche[]> {
    const rows = await query<Row>(
      this.pool,

      `SELECT c.id_commercial AS id,
              c.nom AS nomFamille,
              c.prenom,
              c.abreviation,
              c.telephone,
              c.email,
              c.id_agence AS agenceId,
              a.nom AS agence,
              a.code AS codeAgence,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS nom,
              c.telephone AS contact,
              COUNT(l.id_location) AS conclues,
              COALESCE(SUM(l.montant_total), 0) AS ca,
              (SELECT COUNT(*) FROM reservation r
                 WHERE r.id_commercial = c.id_commercial
                   AND r.statut <> 'ANNULEE') AS reservationsConclues,
              (SELECT COUNT(*) FROM mouvement_vehicule m
                 WHERE (m.id_validateur = c.id_commercial OR m.id_commercial = c.id_commercial)
                   AND m.type_mouvement = 'ENVOI_GARAGE') AS passagesGarageConclues,
              (SELECT COUNT(*) FROM vente_vehicule v
                 WHERE v.id_commercial = c.id_commercial
                   AND v.statut = 'CONCLUE') AS ventesConclues
         FROM commercial c
         LEFT JOIN agence a ON a.id_agence = c.id_agence
         LEFT JOIN location l ON l.id_commercial = c.id_commercial AND l.statut <> 'ANNULEE'
        WHERE c.actif = TRUE
        GROUP BY c.id_commercial, c.nom, c.prenom, c.abreviation, c.telephone, c.email,
                 c.id_agence, a.nom, a.code
        ORDER BY c.id_commercial`,
    )

    return rows.map((r) => {
      const conclues = num(r.conclues)

      return {
        id: num(r.id),

        nom: str(r.nom),

        nomFamille: str(r.nomFamille),

        prenom: r.prenom == null ? null : str(r.prenom),

        abreviation: r.abreviation == null ? null : str(r.abreviation),

        contact: str(r.contact),

        telephone: r.telephone == null ? null : str(r.telephone),

        email: r.email == null ? null : str(r.email),

        agenceId: r.agenceId == null ? null : num(r.agenceId),

        agence: strNull(r.agence),

        codeAgence: strNull(r.codeAgence),

        locationsConclues: conclues,

        reservationsConclues: num(r.reservationsConclues),

        passagesGarageConclues: num(r.passagesGarageConclues),

        ventesConclues: num(r.ventesConclues),

        chiffreAffaires: num(r.ca),

        performance: performanceOf(conclues),
      }
    })
  }

  async create(input: CommercialInput, adminId: number): Promise<Commercial> {
    const [result] = await this.pool.query(
      `INSERT INTO commercial
         (nom, prenom, abreviation, telephone, email, id_agence, actif, id_administrateur)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)`,

      [
        input.nom,

        input.prenom ?? null,

        input.abreviation ?? null,

        input.telephone ?? null,

        input.email?.trim() || null,

        input.agenceId ?? null,

        adminId,
      ],
    )

    const created = await this.get((result as mysql.ResultSetHeader).insertId)

    if (!created) throw new Error("Commercial créé mais introuvable")

    return created
  }

  async update(id: number, input: CommercialInput): Promise<Commercial | null> {
    const fields = [
      "nom = ?",
      "prenom = ?",
      "abreviation = ?",
      "telephone = ?",
      "email = ?",
    ]

    const params: unknown[] = [
      input.nom,

      input.prenom || null,

      input.abreviation || null,

      input.telephone || null,

      input.email?.trim() || null,
    ]

    if (input.agenceId !== undefined) {
      fields.push("id_agence = ?")

      params.push(input.agenceId)
    }

    params.push(id)

    await this.pool.query(
      `UPDATE commercial SET ${fields.join(", ")} WHERE id_commercial = ?`,
      params,
    )

    return this.get(id)
  }

  async importMany(inputs: CommercialInput[], adminId: number): Promise<{
    created: number
    updated: number
  }> {
    const connection = await this.pool.getConnection()

    let created = 0

    let updated = 0

    try {
      await connection.beginTransaction()

      for (const input of inputs) {
        const [existingRows] = (await connection.query(
          "SELECT id_commercial FROM commercial WHERE abreviation = ? LIMIT 1 FOR UPDATE",

          [input.abreviation],
        )) as unknown as [Row[], unknown]

        const existingId = existingRows[0]
          ? num(existingRows[0].id_commercial)
          : null

        if (existingId !== null) {
          await connection.query(
            `UPDATE commercial
                SET nom = ?, prenom = ?, telephone = ?, email = ?, id_agence = ?
              WHERE id_commercial = ?`,

            [
              input.nom,
              input.prenom ?? null,
              input.telephone ?? null,
              input.email?.trim() || null,
              input.agenceId ?? null,
              existingId,
            ],
          )

          updated += 1
        } else {
          await connection.query(
            `INSERT INTO commercial
              (nom, prenom, abreviation, telephone, email, id_agence, actif, id_administrateur)
             VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)`,

            [
              input.nom,
              input.prenom ?? null,
              input.abreviation,
              input.telephone ?? null,
              input.email?.trim() || null,
              input.agenceId ?? null,
              adminId,
            ],
          )

          created += 1
        }
      }

      await connection.commit()

      return { created, updated }
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM commercial WHERE id_commercial = ?",
      [id],
    )

    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlProlongationRepo implements ProlongationRepo {
  constructor(private pool: mysql.Pool) {}

  async list(): Promise<Prolongation[]> {
    await refreshRentalStatuses(this.pool)

    return (
      await query<Row>(
        this.pool,
        "SELECT * FROM prolongation_location ORDER BY date_demande DESC",
        [],
      )
    ).map(mapProlongation)
  }

  async get(id: number): Promise<Prolongation | null> {
    await refreshRentalStatuses(this.pool)

    const rows = await query<Row>(
      this.pool,
      "SELECT * FROM prolongation_location WHERE id_prolongation = ?",
      [id],
    )

    return rows[0] ? mapProlongation(rows[0]) : null
  }

  async create(input: ProlongationInput): Promise<Prolongation> {
    const [result] = await this.pool.query(
      `INSERT INTO prolongation_location
        (id_location, ancienne_date_fin, nouvelle_date_fin, date_demande, motif, montant_supplementaire, id_commercial)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,

      [
        input.locationId,
        input.ancienneDateFin ?? null,
        input.nouvelleDateFin,
        input.dateDemande,
        input.motif ?? null,
        input.montantSupplementaire,
        input.commercialId ?? null,
      ],
    )

    const row = await this.get(
      Number((result as mysql.ResultSetHeader).insertId),
    )

    if (!row) throw new Error("Prolongation créée mais introuvable")

    return row
  }

  async update(
    id: number,
    input: Partial<ProlongationInput>,
  ): Promise<Prolongation | null> {
    const current = await this.get(id)

    if (!current) return null

    const next = { ...current, ...input }

    await this.pool.query(
      `UPDATE prolongation_location SET id_location = ?, ancienne_date_fin = ?, nouvelle_date_fin = ?,
        statut = CASE WHEN ? >= ? THEN 'EN_COURS' ELSE 'EXPIRE' END,
        date_demande = ?, motif = ?, montant_supplementaire = ?, id_commercial = ?
       WHERE id_prolongation = ?`,

      [
        next.locationId,
        next.ancienneDateFin,
        next.nouvelleDateFin,
        sqlDateTime(next.nouvelleDateFin),
        localSqlDateTimeNow(),
        next.dateDemande,
        next.motif,
        next.montantSupplementaire,
        next.commercialId,
        id,
      ],
    )

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM prolongation_location WHERE id_prolongation = ?",
      [id],
    )

    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }
}

class MysqlLocationRepo implements LocationRepo {
  constructor(private pool: mysql.Pool) {}

  async refreshStatuses(): Promise<void> {
    await refreshRentalStatuses(this.pool)
  }

  async list(options?: ListOptions): Promise<Location[]> {
    await this.refreshStatuses()

    let sql = `SELECT id_location AS id, numero_contrat AS reference,
                      id_client AS client_id, id_vehicule AS vehicule_id,
                      id_commercial AS commercial_id, type_location, date_debut,
                      date_fin_prevue, date_retour_reelle, montant_total, statut,
                      km_depart, km_retour, km_parcourus,
                      observation, mode_paiement_import, reference_facture_import,
                      date_facturation_import, statut_paiement, date_paiement_import,
                      paye_import
                 FROM location`

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE numero_contrat LIKE ? OR statut LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY id"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapLocation)
  }

  async fiches(limit?: number): Promise<LocationFiche[]> {
    await this.refreshStatuses()

    let sql = `SELECT l.id_location AS id, l.numero_contrat AS reference,
                      l.id_client AS client_id, l.id_vehicule AS vehicule_id,
                      l.id_commercial AS commercial_id, l.type_location,
                      l.date_debut, l.date_fin_prevue, l.date_retour_reelle, l.montant_total, l.statut,
                      l.km_depart, l.km_retour, l.km_parcourus,
                      l.observation, l.mode_paiement_import, l.reference_facture_import,
                      l.date_facturation_import, l.statut_paiement, l.date_paiement_import,
                      l.paye_import,
                      COALESCE(l.mode_paiement_import, tableau.mode_de_paiement) AS mode_paiement_export,
                      COALESCE(l.reference_facture_import, tableau.ref_facture) AS reference_facture_export,
                      COALESCE(l.date_facturation_import, tableau.date_facturation) AS date_facturation_export,
                      COALESCE(l.date_paiement_import, tableau.date_de_paiement) AS date_paiement_export,
                      CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
                      COALESCE(CONCAT(v.marque, ' ', v.modele), CONCAT('Véhicule #', l.id_vehicule)) AS vehicule_nom
                 FROM location l
                 JOIN client c ON c.id_client = l.id_client
                 LEFT JOIN vehicule v ON v.id_vehicule = l.id_vehicule
                 LEFT JOIN v_tableau_locations tableau ON tableau.id_location = l.id_location
                ORDER BY l.id_location`

    const params: unknown[] = []

    if (limit) {
      sql += " LIMIT ?"

      params.push(limit)
    }

    const rows = await query<Row>(this.pool, sql, params)

    return rows.map((r) => ({
      ...mapLocation(r),
      client: str(r.client_nom),
      vehicule: str(r.vehicule_nom),
    }))
  }

  async get(id: number): Promise<Location | null> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,
      "SELECT id_location AS id, numero_contrat AS reference, id_client AS client_id, id_vehicule AS vehicule_id, id_commercial AS commercial_id, type_location, date_debut, date_fin_prevue, date_retour_reelle, montant_total, statut, km_depart, km_retour, km_parcourus, observation, mode_paiement_import, reference_facture_import, date_facturation_import, statut_paiement, date_paiement_import, paye_import FROM location WHERE id_location = ?",
      [id],
    )

    return rows[0] ? mapLocation(rows[0]) : null
  }

  async create(input: LocationInput, adminId?: number): Promise<Location> {
    const dateDebut = sqlDateTime(input.dateDebut)

    const dateFin = sqlDateTime(input.dateFin)

    const nowVal = localSqlDateTimeNow()

    const statut = input.statut ?? "EN_COURS"

    const statutEffectif =
      statut === "EN_COURS" && dateFin < nowVal ? "EN_RETARD" : statut

    const dateRetour =
      statut === "TERMINEE"
        ? dateDebut > nowVal
          ? dateDebut
          : nowVal
        : null

    const connection = await this.pool.getConnection()

    let id = 0

    try {
      await connection.beginTransaction()

      const vehicles = await query<Row>(
        connection,
        "SELECT kilometrage FROM vehicule WHERE id_vehicule = ? FOR UPDATE",
        [input.vehiculeId],
      )
      if (!vehicles[0]) throw new Error("Véhicule introuvable")

      const [result] = await connection.query(
        `INSERT INTO location
        (numero_contrat, type_location, date_debut, date_fin_prevue, km_depart, km_retour,
         montant_total, statut, date_retour_reelle, observation, statut_paiement,
         mode_paiement_import, reference_facture_import, date_facturation_import,
         date_paiement_import, paye_import, id_client, id_vehicule, id_commercial, id_administrateur)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              COALESCE(?, (SELECT id_commercial FROM commercial ORDER BY id_commercial LIMIT 1)),
              COALESCE(?, (SELECT id_administrateur FROM administrateur ORDER BY id_administrateur LIMIT 1)))`,

        [
          input.reference?.trim() || `LOC-${String(Date.now()).slice(-5)}`,

          input.type === "Longue durée" ? "LONGUE_DUREE" : "COURTE_DUREE",

          dateDebut,

          dateFin,

          num(vehicles[0].kilometrage),

          input.kmRetour ?? null,

          input.montant ?? 0,

          statutEffectif,

          statutEffectif === "TERMINEE" ? null : dateRetour,

          input.observation?.trim() || null,

          input.paye ? "PAYEE" : "NON_PAYEE",

          input.modePaiement?.trim() || null,

          input.referenceFacture?.trim() || null,

          input.dateFacturation?.slice(0, 10) || null,

          input.datePaiement?.slice(0, 10) || null,

          input.payeImport ?? null,

          input.clientId,

          input.vehiculeId,

          input.commercialId ?? null,

          adminId ?? null,
        ],
      )

      id = Number((result as mysql.ResultSetHeader).insertId)

      if (id === 0) throw new Error("Location non créée")

      if (statutEffectif === "TERMINEE") {
        await connection.query(
          "UPDATE location SET date_retour_reelle = ? WHERE id_location = ?",
          [dateRetour, id],
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback().catch(() => undefined)

      throw error
    } finally {
      connection.release()
    }

    const created = await this.get(id)

    if (!created) throw new Error("Location créée mais introuvable")

    return created
  }

  async update(
    id: number,
    input: Partial<LocationInput>,
  ): Promise<Location | null> {
    const current = await this.get(id)

    if (!current) return null

    const next = { ...current, ...input }
    const dateFinToSave = input.prolongation ? current.dateFin : next.dateFin
    const montantToSave = input.prolongation ? current.montant : next.montant

    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      await connection.query(
        `UPDATE location SET numero_contrat = ?, type_location = ?, date_debut = ?,
        date_fin_prevue = ?, montant_total = ?, observation = ?,
        mode_paiement_import = ?, reference_facture_import = ?,
        date_facturation_import = ?, date_paiement_import = ?, paye_import = ?,
        km_retour = ?,
        date_retour_reelle = CASE
          WHEN ? = 'TERMINEE' AND ? <> 'TERMINEE' THEN ?
          WHEN ? <> 'TERMINEE' THEN NULL
          ELSE date_retour_reelle END,
        statut = CASE WHEN ? = 'EN_COURS' AND ? < ? THEN 'EN_RETARD' ELSE ? END,
        id_client = ?,
        id_vehicule = ?, id_commercial = ? WHERE id_location = ?`,

        [
          next.reference,

          next.type === "Longue durée" ? "LONGUE_DUREE" : "COURTE_DUREE",

          sqlDateTime(next.dateDebut),

          sqlDateTime(dateFinToSave),

          montantToSave,

          next.observation?.trim() || null,

          next.modePaiement?.trim() || null,

          next.referenceFacture?.trim() || null,

          next.dateFacturation?.slice(0, 10) || null,

          next.datePaiement?.slice(0, 10) || null,

          next.payeImport ?? null,

          next.kmRetour ?? null,

          next.statut,

          current.statut,

          localSqlDateTimeNow(),

          next.statut,

          next.statut,

          sqlDateTime(next.dateFin),

          localSqlDateTimeNow(),

          next.statut,

          next.clientId,

          next.vehiculeId,

          next.commercialId,

          id,
        ],
      )

      if (input.prolongation) {
        const p = input.prolongation

        try {
          await connection.query(
            `INSERT INTO prolongation_location
              (id_location, ancienne_date_fin, nouvelle_date_fin, date_demande, motif, montant_supplementaire, id_commercial)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,

            [
              id,
              sqlDateTime(p.ancienneDateFin ?? current.dateFin),
              sqlDateTime(p.nouvelleDateFin),
              sqlDateTime(p.dateDemande),
              p.motif ?? null,
              p.montantSupplementaire,
              p.commercialId ?? next.commercialId,
            ],
          )
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ER_SIGNAL_EXCEPTION" &&
            "sqlMessage" in error &&
            typeof error.sqlMessage === "string"
          ) {
            throw conflict(error.sqlMessage)
          }

          throw error
        }
      }

      const wasCompleted = current.statut === "TERMINEE"

      const isCompleted = next.statut === "TERMINEE"

      if (wasCompleted && !isCompleted) {
        const vehicles = await query<Row>(
          connection,
          "SELECT kilometrage FROM vehicule WHERE id_vehicule = ? FOR UPDATE",
          [next.vehiculeId],
        )
        if (!vehicles[0]) throw new Error("Véhicule introuvable")

        await connection.query(
          `INSERT INTO mouvement_vehicule
            (type_mouvement, motif, date_mouvement, kilometrage, observation, id_vehicule, id_location)
           VALUES ('MISE_EN_LOCATION', 'LOCATION', ?, ?, ?, ?, ?)`,
          [
            localSqlDateTimeNow(),
            num(vehicles[0].kilometrage),
            next.reference,
            next.vehiculeId,
            id,
          ],
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback().catch(() => undefined)

      throw error
    } finally {
      connection.release()
    }

    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      const [rows] = (await connection.query(
        "SELECT id_vehicule, numero_contrat, statut FROM location WHERE id_location = ? FOR UPDATE",

        [id],
      )) as unknown as [Row[], unknown]

      const location = rows[0]

      if (!location) {
        await connection.rollback()

        return false
      }

      if (location.statut !== "TERMINEE") {
        await connection.query(
          `INSERT INTO mouvement_vehicule
            (type_mouvement, date_mouvement, observation, id_vehicule, id_location)
           VALUES ('RETOUR_LOCATION', ?, ?, ?, ?)`,

          [
            localSqlDateTimeNow(),
            `Clôture de ${location.numero_contrat ?? `location #${id}`}`,
            location.id_vehicule,
            id,
          ],
        )
      }

      const [result] = await connection.query(
        "DELETE FROM location WHERE id_location = ?",
        [id],
      )

      const [latestRows] = (await connection.query(
        `SELECT type_mouvement AS type, kilometrage FROM mouvement_vehicule
          WHERE id_vehicule = ? ORDER BY date_mouvement DESC, id_mouvement DESC LIMIT 1`,

        [location.id_vehicule],
      )) as unknown as [Row[], unknown]

      const latest = latestRows[0]

      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = COALESCE(?, kilometrage) WHERE id_vehicule = ?",

        [
          latest?.type ?? "ENTREE_PARC",
          latest?.kilometrage ?? null,
          location.id_vehicule,
        ],
      )

      await connection.commit()

      return Number((result as mysql.ResultSetHeader).affectedRows) > 0
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,

      `SELECT l.*, CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
              COALESCE(
                NULLIF(CONCAT_WS(' ', v.marque, v.modele, NULLIF(v.version, '')), ''),
                CONCAT('Véhicule #', l.id_vehicule)
              ) AS vehicule_nom
         FROM location l
         JOIN client c ON c.id_client = l.id_client
         LEFT JOIN vehicule v ON v.id_vehicule = l.id_vehicule
        WHERE l.id_client = ?
        ORDER BY l.date_fin_prevue DESC`,

      [clientId],
    )

    return rows.map((r) => ({
      ...mapLocation(r),
      client: str(r.client_nom),
      vehicule: str(r.vehicule_nom),
    }))
  }

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Location[]> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,

      `SELECT id_location AS id, numero_contrat AS reference, id_client AS client_id,
              id_vehicule AS vehicule_id, id_commercial AS commercial_id,
              type_location, date_debut, date_fin_prevue, montant_total, statut, observation,
              statut_paiement, mode_paiement_import, reference_facture_import,
              date_facturation_import, date_paiement_import, paye_import
         FROM location
        WHERE id_vehicule = ?
          AND statut IN ('EN_COURS', 'EN_RETARD', 'EN_PROLONGATION')
          AND date_debut <= ? AND ? <= date_fin_prevue`,

      [vehiculeId, fin, debut],
    )

    return rows.map(mapLocation)
  }
}

class MysqlReservationRepo implements ReservationRepo {
  constructor(private pool: mysql.Pool) {}

  private statusToDb(status: Reservation["statut"]): string {
    return {
      "À venir": "A_VENIR",
      "En cours": "EN_COURS",
      Terminée: "TERMINEE",
      Annulée: "ANNULEE",
    }[status]
  }

  async refreshStatuses(): Promise<void> {
    await this.pool.query(
      `UPDATE reservation
          SET statut = 'ANNULEE'
        WHERE statut = 'A_VENIR'
          AND date_debut_prevue IS NOT NULL
          AND TIMESTAMP(date_debut_prevue, '23:59:00') <= NOW()`,
    )
    await this.pool.query(
      `UPDATE vehicule v
         JOIN reservation r ON r.id_vehicule = v.id_vehicule
          SET v.statut = 'ENTREE_PARC'
        WHERE r.statut = 'ANNULEE'
          AND v.statut = 'RESERVATION'
          AND r.date_debut_prevue IS NOT NULL
          AND TIMESTAMP(r.date_debut_prevue, '23:59:00') <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM reservation active
             WHERE active.id_vehicule = r.id_vehicule
               AND active.statut IN ('A_VENIR', 'EN_COURS')
          )`,
    )
    await this.pool.query(
      `UPDATE reservation
          SET statut = 'TERMINEE'
        WHERE statut = 'EN_COURS'
          AND date_fin_prevue IS NOT NULL
          AND TIMESTAMP(date_fin_prevue, '23:59:00') <= NOW()`,
    )
    await this.pool.query(
      `UPDATE vehicule v
         JOIN reservation r ON r.id_vehicule = v.id_vehicule
          SET v.statut = 'ENTREE_PARC'
        WHERE r.statut = 'TERMINEE'
          AND v.statut = 'RESERVATION'
          AND r.date_fin_prevue IS NOT NULL
          AND TIMESTAMP(r.date_fin_prevue, '23:59:00') <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM reservation active
             WHERE active.id_vehicule = r.id_vehicule
               AND active.statut IN ('A_VENIR', 'EN_COURS')
          )`,
    )
  }

  async list(options?: ListOptions): Promise<Reservation[]> {
    await this.refreshStatuses()

    let sql = `SELECT *
                 FROM reservation`

    const params: unknown[] = []

    if (options?.q) {
      sql +=
        " WHERE COALESCE(ref_proforma, CAST(id_reservation AS CHAR)) LIKE ? OR statut LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY id_reservation"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapReservation)
  }

  async fiches(): Promise<ReservationFiche[]> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,

      `SELECT r.*, v.immatriculation, v.marque, v.modele,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
              CONCAT_WS(' ', NULLIF(co.prenom, ''), co.nom) AS commercial_nom
         FROM reservation r
         LEFT JOIN client c ON c.id_client = r.id_client
         LEFT JOIN commercial co ON co.id_commercial = r.id_commercial
         JOIN vehicule v ON v.id_vehicule = r.id_vehicule
        ORDER BY r.id_reservation`,
    )

    return rows.map((r) => ({
      ...mapReservation(r),

      client: str(r.client_nom || r.client_import || ""),

      commercial: strNull(r.commercial_nom || r.commercial_import),

      vehicule: `${str(r.marque)} ${str(r.modele)}`.trim(),

      immatriculation: str(r.immatriculation),
    }))
  }

  async lostAffairsFromReservations(): Promise<ReservationLostAffairExportRow[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT
          COALESCE(NULLIF(CONCAT_WS(' ', co.prenom, co.nom), ''), r.commercial_import) AS agent_vente,
          COALESCE(a.ref_proforma, r.ref_proforma) AS ref_proforma,
          DATE_FORMAT(COALESCE(a.date_reservation, r.date_reservation), '%Y-%m-%d') AS date_reservation,
          COALESCE(NULLIF(CONCAT_WS(' ', c.prenom, c.nom), ''), r.client_import) AS client,
          COALESCE(a.ref_bon_commande, r.ref_bon_commande) AS ref_bon_commande,
          DATE_FORMAT(relance.derniere_relance, '%Y-%m-%d') AS relance,
          DATE_FORMAT(a.date_annulation, '%Y-%m-%d') AS date_annulation,
          COALESCE(m.libelle, a.detail_motif, r.detail_non_aboutissement) AS motif_annulation,
          COALESCE(
            a.vehicule_demande,
            NULLIF(CONCAT_WS(' ', v.marque, v.modele, v.version), '')
          ) AS vehicule_demande,
          a.vehicule_propose
         FROM affaire_perdue a
         JOIN reservation r ON r.id_reservation = a.id_reservation
         LEFT JOIN commercial co ON co.id_commercial = COALESCE(a.id_commercial, r.id_commercial)
         LEFT JOIN client c ON c.id_client = COALESCE(a.id_client, r.id_client)
         LEFT JOIN motif_non_aboutissement m ON m.id_motif = a.id_motif
         LEFT JOIN vehicule v ON v.id_vehicule = r.id_vehicule
         LEFT JOIN (
           SELECT id_affaire, MAX(date_relance) AS derniere_relance
             FROM relance
            GROUP BY id_affaire
         ) relance ON relance.id_affaire = a.id_affaire
        WHERE r.statut = 'ANNULEE'
        ORDER BY a.date_annulation, a.id_affaire`,
    )

    return rows.map((row) => ({
      agentVente: strNull(row.agent_vente),
      refProforma: strNull(row.ref_proforma),
      dateReservation: strNull(row.date_reservation),
      client: strNull(row.client),
      refBonCommande: strNull(row.ref_bon_commande),
      relance: strNull(row.relance),
      dateAnnulation: strNull(row.date_annulation),
      motifAnnulation: strNull(row.motif_annulation),
      vehiculeDemande: strNull(row.vehicule_demande),
      vehiculePropose: strNull(row.vehicule_propose),
    }))
  }

  async get(id: number): Promise<Reservation | null> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,
      "SELECT * FROM reservation WHERE id_reservation = ?",
      [id],
    )

    return rows[0] ? mapReservation(rows[0]) : null
  }

  async history(id: number): Promise<ReservationHistoryEntry[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_suivi, ancien_statut, nouveau_statut, date_changement, commentaire
         FROM suivi_reservation
        WHERE id_reservation = ?
        ORDER BY date_changement DESC, id_suivi DESC`,
      [id],
    )
    const labels: Record<string, string> = {
      A_VENIR: "À venir",
      EN_COURS: "En cours",
      TERMINEE: "Terminée",
      ANNULEE: "Annulée",
    }
    return rows.map((row) => ({
      id: num(row.id_suivi),
      ancienStatut: strNull(row.ancien_statut)
        ? (labels[str(row.ancien_statut)] ?? str(row.ancien_statut))
        : null,
      nouveauStatut: labels[str(row.nouveau_statut)] ?? str(row.nouveau_statut),
      dateChangement: str(row.date_changement),
      commentaire: strNull(row.commentaire),
    }))
  }

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Reservation[]> {
    await this.refreshStatuses()

    const rows = await query<Row>(
      this.pool,

      `SELECT id_reservation, ref_proforma, id_client, id_vehicule, id_commercial,
              date_debut_prevue, duree_jours, statut
         FROM reservation
        WHERE id_vehicule = ?
          AND statut IN ('A_VENIR', 'EN_COURS')
          AND date_debut_prevue IS NOT NULL
          AND date_fin_prevue IS NOT NULL
          AND date_debut_prevue <= ?
          AND date_fin_prevue >= ?`,

      [vehiculeId, fin, debut],
    )

    return rows.map(mapReservation)
  }

  async create(input: ReservationInput): Promise<Reservation> {
    await this.refreshStatuses()

    const id = await inTransaction(this.pool, async (connection) => {
      if (input.dateDepart && input.dateFin) {
        await assertVehicleAvailable(
          connection,
          input.vehiculeId,
          input.dateDepart,
          input.dateFin,
        )
      }

      const [result] = await connection.query(
        `INSERT INTO reservation
           (date_reservation, date_debut_prevue, date_fin_prevue, mission,
            lieu_mission, statut_confirmation_import, statut_facturation,
            statut_paiement, id_client, id_vehicule, id_commercial)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.dateReservation ?? null,
          input.dateDepart,
          input.dateFin,
          input.mission ?? null,
          input.lieuMission ?? null,
          input.statutConfirmation ?? null,
          input.statutFacturation ?? "NON_FACTUREE",
          input.statutPaiement ?? "NON_PAYEE",
          input.clientId,
          input.vehiculeId,
          input.commercialId,
        ],
      )

      await connection.query(
        "UPDATE vehicule SET statut = 'RESERVATION' WHERE id_vehicule = ?",
        [input.vehiculeId],
      )

      return (result as mysql.ResultSetHeader).insertId
    })

    const created = await this.get(id)

    if (!created) throw new Error("Réservation créée introuvable")

    return created
  }

  async update(
    id: number,
    input: ReservationUpdateInput,
  ): Promise<Reservation | null> {
    await this.refreshStatuses()
    await inTransaction(this.pool, async (connection) => {
      const current = await query<Row>(
        connection,
        "SELECT statut FROM reservation WHERE id_reservation = ? FOR UPDATE",
        [id],
      )
      if (!current[0]) return

      if (
        ["A_VENIR", "EN_COURS"].includes(str(current[0].statut)) &&
        input.dateDepart &&
        input.dateFin
      ) {
        await assertVehicleAvailable(
          connection,
          input.vehiculeId,
          input.dateDepart,
          input.dateFin,
          id,
        )
      }

      await connection.query(
        `UPDATE reservation
            SET date_reservation = ?, date_debut_prevue = ?, date_fin_prevue = ?,
                duree_jours_import = NULL, mission = ?, lieu_mission = ?,
                statut_confirmation_import = ?, statut_facturation = ?,
                statut_paiement = ?, client_import = ?, commercial_import = ?,
                id_client = ?, id_vehicule = ?, id_commercial = ?
          WHERE id_reservation = ?`,
        [
          input.dateReservation,
          input.dateDepart,
          input.dateFin,
          input.mission,
          input.lieuMission,
          input.statutConfirmation,
          input.statutFacturation,
          input.statutPaiement,
          input.clientImport,
          input.commercialImport,
          input.clientId,
          input.vehiculeId,
          input.commercialId,
          id,
        ],
      )
    })
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM reservation WHERE id_reservation = ?",
      [id],
    )
    return (result as mysql.ResultSetHeader).affectedRows > 0
  }

  async importMany(inputs: ReservationImportInput[]): Promise<number> {
    await inTransaction(this.pool, async (connection) => {
      const [[clock]] = (await connection.query(
        "SELECT CURRENT_DATE AS today",
      )) as unknown as [Row[], unknown]
      const today = str(clock?.today).slice(0, 10)

      for (const input of inputs) {
        const status = this.statusToDb(input.statut)
        const shouldCheckAvailability =
          (input.statut === "À venir" &&
            input.dateDepart !== null &&
            input.dateDepart >= today) ||
          (input.statut === "En cours" &&
            input.dateFin !== null &&
            input.dateFin >= today)
        if (shouldCheckAvailability && input.dateDepart && input.dateFin) {
          await assertVehicleAvailable(
            connection,
            input.vehiculeId,
            input.dateDepart,
            input.dateFin,
          )
        }

        await connection.query(
          `INSERT INTO reservation
          (date_reservation, date_debut_prevue, date_fin_prevue, mission,
           lieu_mission, statut, statut_paiement, statut_facturation,
           statut_confirmation_import, client_import, commercial_import,
           duree_jours_import, id_client, id_vehicule, id_commercial)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.dateReservation,
            input.dateDepart,
            input.dateFin,
            input.mission,
            input.lieuMission,
            status,
            input.statutPaiement,
            input.statutFacturation,
            input.statutConfirmation,
            input.clientImport,
            input.commercialImport,
            input.dureeJours,
            input.clientId,
            input.vehiculeId,
            input.commercialId,
          ],
        )
        if (["A_VENIR", "EN_COURS"].includes(status)) {
          await connection.query(
            "UPDATE vehicule SET statut = 'RESERVATION' WHERE id_vehicule = ?",
            [input.vehiculeId],
          )
        }
      }
    })

    await this.refreshStatuses()
    return inputs.length
  }

  async updateStatus(
    id: number,
    status: Reservation["statut"],
  ): Promise<Reservation | null> {
    const newStatus = {
      "À venir": "A_VENIR",
      "En cours": "EN_COURS",
      Terminée: "TERMINEE",
      Annulée: "ANNULEE",
    }[status]

    await inTransaction(this.pool, async (connection) => {
      const rows = await query<Row>(
        connection,
        `SELECT statut, date_debut_prevue, date_fin_prevue, id_vehicule
           FROM reservation
          WHERE id_reservation = ?
          FOR UPDATE`,
        [id],
      )
      const reservation = rows[0]
      if (!reservation) return

      const currentStatus = str(reservation.statut)
      const now = await query<Row>(
        connection,
        "SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS today, DATE_FORMAT(CURRENT_TIME, '%H:%i:%s') AS heure_actuelle",
      )
      const today = str(now[0]?.today)
      const currentTime = str(now[0]?.heure_actuelle)
      const startDate = str(reservation.date_debut_prevue).slice(0, 10)
      const endDate = str(reservation.date_fin_prevue).slice(0, 10)

      const canStart =
        currentStatus === "A_VENIR" &&
        newStatus === "EN_COURS" &&
        startDate === today &&
        currentTime < "23:59:00"
      const canCancel = currentStatus === "A_VENIR" && newStatus === "ANNULEE"
      const canComplete =
        currentStatus === "EN_COURS" && newStatus === "TERMINEE"

      if (!canStart && !canCancel && !canComplete) {
        throw new ReservationStatusConflictError(
          currentStatus === "A_VENIR" && newStatus === "EN_COURS"
            ? "Une réservation ne peut être démarrée que le jour prévu, avant 23 h 59."
            : "Cette transition de statut n’est pas autorisée.",
        )
      }

      if (newStatus === "EN_COURS" && startDate > today) {
        throw new ReservationStatusConflictError(
          "La réservation ne peut pas commencer avant la date prévue.",
        )
      }
      await connection.query(
        "UPDATE reservation SET statut = ? WHERE id_reservation = ?",
        [newStatus, id],
      )

      if (newStatus === "ANNULEE" || newStatus === "TERMINEE") {
        await connection.query(
          `UPDATE vehicule
              SET statut = 'ENTREE_PARC'
            WHERE id_vehicule = ?
              AND NOT EXISTS (
                SELECT 1 FROM reservation active
                 WHERE active.id_vehicule = ?
                   AND active.id_reservation <> ?
                   AND active.statut IN ('A_VENIR', 'EN_COURS')
              )`,
          [reservation.id_vehicule, reservation.id_vehicule, id],
        )
      }
    })

    return this.get(id)
  }
}

class MysqlMaintenanceRepo implements MaintenanceRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Maintenance[]> {
    let sql = `SELECT p.id_passage AS id, p.id_vehicule AS vehicule_id, p.date_entree,
                      p.date_sortie_reelle AS date_sortie, p.motif,
                      p.cout_total AS cout, p.id_vehicule_remplacement AS remplacement_id,
                      p.statut
                 FROM passage_garage p`

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE p.motif LIKE ? OR p.statut LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY p.date_entree DESC"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    const rows = await query<Row>(this.pool, sql, params)

    return rows.map(mapMaintenance)
  }

  async get(id: number): Promise<Maintenance | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_passage AS id, id_vehicule AS vehicule_id, date_entree,
              date_sortie_reelle AS date_sortie, motif, cout_total AS cout,
              id_vehicule_remplacement AS remplacement_id, statut
         FROM passage_garage
        WHERE id_passage = ?`,

      [id],
    )

    const r = rows[0]

    if (!r) return null

    return mapMaintenance(r)
  }

  async openForVehicule(vehiculeId: number): Promise<Maintenance | null> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_passage AS id, id_vehicule AS vehicule_id, date_entree,
              date_sortie_reelle AS date_sortie, motif, cout_total AS cout,
              id_vehicule_remplacement AS remplacement_id
         FROM passage_garage
        WHERE id_vehicule = ? AND statut = 'EN_COURS'
        ORDER BY date_entree DESC
        LIMIT 1`,

      [vehiculeId],
    )

    const r = rows[0]

    if (!r) return null

    return {
      id: num(r.id),

      vehiculeId: num(r.vehicule_id),

      dateEntree: str(r.date_entree).slice(0, 10),

      dateSortie: r.date_sortie ? str(r.date_sortie).slice(0, 10) : null,

      motif: str(r.motif),

      cout: num(r.cout),

      remplacementId: numNull(r.remplacement_id),

      statut: "En cours",
    }
  }

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Maintenance[]> {
    const rows = await query<Row>(
      this.pool,

      `SELECT id_passage AS id, id_vehicule AS vehicule_id, date_entree,
              date_sortie_reelle AS date_sortie, motif, cout_total AS cout,
              id_vehicule_remplacement AS remplacement_id, statut
         FROM passage_garage
        WHERE id_vehicule = ?
          AND statut IN ('A_VENIR', 'EN_COURS')
          AND date_entree <= ?
          AND COALESCE(date_sortie_reelle, date_sortie_prevue, '9999-12-31') >= ?
        ORDER BY date_entree`,

      [vehiculeId, fin, debut],
    )

    return rows.map(mapMaintenance)
  }
}

class MysqlMouvementRepo implements MouvementRepo {
  constructor(private pool: mysql.Pool) {}

  async list(vehiculeId?: number): Promise<Mouvement[]> {
    let sql = `SELECT d.id_mouvement AS id, d.id_vehicule AS vehicule_id,
                      d.id_location AS location_id, d.id_passage AS passage_id,
                      d.id_commercial AS commercial_id, d.id_validateur AS validateur_id,
                      d.type_mouvement AS type, d.motif, d.kilometrage, d.date_mouvement,
                      d.observation AS commentaire, r.kilometrage AS km_retour,
                      r.date_mouvement AS date_retour,
                      CASE WHEN r.kilometrage IS NULL OR d.kilometrage IS NULL
                           THEN NULL ELSE r.kilometrage - d.kilometrage END AS km_parcourus,
                      CASE WHEN d.type_mouvement IN ('MISE_EN_LOCATION','SORTIE_INTERNE','ENVOI_GARAGE')
                           THEN d.kilometrage ELSE p.kilometrage END AS km_depart
                 FROM mouvement_vehicule d
                 LEFT JOIN mouvement_vehicule r ON r.id_mouvement_depart = d.id_mouvement
                 LEFT JOIN mouvement_vehicule p ON p.id_mouvement = d.id_mouvement_depart`

    const params: unknown[] = []

    if (vehiculeId !== undefined) {
      sql += " WHERE d.id_vehicule = ?"

      params.push(vehiculeId)
    }

    sql += " ORDER BY d.date_mouvement DESC, d.id_mouvement DESC"

    const rows = await query<Row>(this.pool, sql, params)

    return rows.map((r) => ({
      id: num(r.id),

      vehiculeId: num(r.vehicule_id),

      locationId: numNull(r.location_id),

      passageId: numNull(r.passage_id),

      commercialId: numNull(r.commercial_id),

      validateurId: numNull(r.validateur_id),

      type: r.type as Mouvement["type"],

      motif: strNull(r.motif),

      kilometrage: numNull(r.kilometrage),

      kmDepart: numNull(r.km_depart),

      kmRetour: numNull(r.km_retour),

      kmParcourus: numNull(r.km_parcourus),

      date: str(r.date_mouvement),

      dateRetour: r.date_retour ? str(r.date_retour) : null,

      commentaire: strNull(r.commentaire),
    }))
  }

  async createEntry(input: {
    vehiculeId: number
    date: string
    kilometrage: number
    observation?: string | null
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO mouvement_vehicule
        (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule)
       VALUES ('ENTREE_PARC', ?, ?, ?, ?)`,

      [
        `${input.date} 00:00:00`,
        input.kilometrage,
        input.observation ?? null,
        input.vehiculeId,
      ],
    )

    await this.pool.query(
      "UPDATE vehicule SET statut = 'ENTREE_PARC', kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",

      [input.kilometrage, input.vehiculeId],
    )
  }

  async changeVehicleStatus(input: {
    vehiculeId: number

    statut: Vehicule["statut"]

    kilometrage: number

    observation?: string | null

    garageId?: number

    typePassage?: PassageGarage["typePassage"]

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
  }): Promise<Mouvement> {
    const connection = await this.pool.getConnection()

    const date = new Date()

    try {
      await connection.beginTransaction()

      let insertId = 0

      let locationId: number | null = null
      let departureId: number | null = null

      if (input.statut === "RETOUR_INTERNE") {
        const departureType = "SORTIE_INTERNE"
        const departures = await query<Row>(
          connection,
          `SELECT id_mouvement AS id
             FROM mouvement_vehicule
            WHERE id_vehicule = ? AND type_mouvement = ?
            ORDER BY date_mouvement DESC, id_mouvement DESC
            LIMIT 1`,
          [input.vehiculeId, departureType],
        )

        if (!departures[0]) {
          throw new Error(
            `Aucun départ ${departureType} ne correspond au retour demandé.`,
          )
        }

        departureId = num(departures[0].id)
      }

      if (
        input.statut !== "MISE_EN_LOCATION" &&
        input.statut !== "ENVOI_GARAGE" &&
        input.statut !== "RETOUR_GARAGE"
      ) {
        const [result] = await connection.query(
          `INSERT INTO mouvement_vehicule
            (type_mouvement, date_mouvement, kilometrage, observation, motif,
             id_commercial, id_vehicule, id_mouvement_depart)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,

          [
            input.statut,
            localSqlDateTimeNow(),
            input.kilometrage,
            input.observation ?? null,
            input.motif ??
              (input.statut === "SORTIE_INTERNE"
                ? input.sortieInterne?.motif
                : null),
            input.statut === "SORTIE_INTERNE"
              ? input.sortieInterne?.commercialId ?? null
              : null,
            input.vehiculeId,
            departureId,
          ],
        )

        insertId = Number((result as { insertId?: number }).insertId ?? 0)

        if (input.statut === "RETOUR_INTERNE" && departureId !== null) {
          await connection.query(
            `UPDATE sortie_interne
                SET id_mouvement_retour = ?, date_retour = ?
              WHERE id_mouvement_depart = ?`,
            [insertId, localSqlDateTimeNow(), departureId],
          )
        }

        await connection.query(
          "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",

          [input.statut, input.kilometrage, input.vehiculeId],
        )

        if (input.statut === "SORTIE_INTERNE" && input.sortieInterne) {
          await connection.query(
            `INSERT INTO sortie_interne
              (id_mouvement_depart, id_commercial, motif, date_depart)
             VALUES (?, ?, ?, ?)`,
            [
              insertId,
              input.sortieInterne.commercialId,
              input.sortieInterne.motif,
              localSqlDateTimeNow(),
            ],
          )
        }
      }

      if (input.statut === "ENVOI_GARAGE") {
        const [garages] = (await connection.query(
          "SELECT id_garage FROM garage WHERE (? IS NULL OR id_garage = ?) ORDER BY id_garage LIMIT 1",

          [input.garageId ?? null, input.garageId ?? null],
        )) as unknown as [Row[], unknown]

        const garage = garages[0]

        if (!garage)
          throw new Error("Aucun garage disponible pour enregistrer le passage")

        const [passageResult] = await connection.query(
          `INSERT INTO passage_garage
           (type_passage, date_entree, km_entree, motif, statut, cout_total, id_vehicule, id_garage)
           VALUES (?, ?, ?, ?, 'EN_COURS', 0, ?, ?)`,

          [
            input.typePassage ?? "REPARATION",
            localSqlDateTimeNow(),
            input.kilometrage,
            input.motif ?? input.observation ?? null,
            input.vehiculeId,
            garage.id_garage,
          ],
        )

        const passageId = Number(
          (passageResult as mysql.ResultSetHeader).insertId,
        )

        await connection.query(
          "UPDATE vehicule SET statut = 'ENVOI_GARAGE', kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",
          [input.kilometrage, input.vehiculeId],
        )

        const movements = await query<Row>(
          connection,
          `SELECT id_mouvement AS id, id_vehicule AS vehicule_id,
                  id_location AS location_id, id_passage AS passage_id,
                  id_commercial AS commercial_id, id_validateur AS validateur_id,
                  type_mouvement AS type, motif, kilometrage, date_mouvement,
                  observation AS commentaire
             FROM mouvement_vehicule
            WHERE id_passage = ? AND type_mouvement = 'ENVOI_GARAGE'
            ORDER BY id_mouvement DESC
            LIMIT 1`,
          [passageId],
        )

        if (!movements[0]) {
          throw new Error("Le mouvement du passage au garage n'a pas été créé.")
        }

        insertId = num(movements[0].id)

        await connection.query(
          "UPDATE mouvement_vehicule SET id_validateur = ? WHERE id_mouvement = ?",
          [input.validateurId ?? null, insertId],
        )
      }

      if (input.statut === "RETOUR_GARAGE") {
        const passages = await query<Row>(
          connection,
          `SELECT id_passage AS id
             FROM passage_garage
            WHERE id_vehicule = ? AND date_sortie_reelle IS NULL
            ORDER BY date_entree DESC, id_passage DESC
            LIMIT 1
            FOR UPDATE`,
          [input.vehiculeId],
        )

        if (!passages[0]) {
          throw new Error(
            "Aucun passage au garage ouvert ne correspond au retour demandé.",
          )
        }

        const passageId = num(passages[0].id)
        const dateSortie = localSqlDateTimeNow()

        await connection.query(
          "UPDATE passage_garage SET date_sortie_reelle = ? WHERE id_passage = ?",
          [dateSortie, passageId],
        )

        await connection.query(
          `UPDATE mouvement_vehicule
              SET kilometrage = ?
            WHERE id_passage = ? AND type_mouvement = 'RETOUR_GARAGE'`,
          [input.kilometrage, passageId],
        )

        const movements = await query<Row>(
          connection,
          `SELECT id_mouvement AS id
             FROM mouvement_vehicule
            WHERE id_passage = ? AND type_mouvement = 'RETOUR_GARAGE'
            ORDER BY id_mouvement DESC
            LIMIT 1`,
          [passageId],
        )

        if (!movements[0]) {
          throw new Error("Le mouvement de retour du garage n'a pas été créé.")
        }

        insertId = num(movements[0].id)

        await connection.query(
          `UPDATE vehicule SET kilometrage = GREATEST(kilometrage, ?)
            WHERE id_vehicule = ?`,
          [input.kilometrage, input.vehiculeId],
        )
      }

      if (input.statut === "MISE_EN_LOCATION") {
        const [locationResult] = await connection.query(
          `INSERT INTO location
            (numero_contrat, type_location, date_debut, date_fin_prevue, km_depart,
             montant_total, statut, id_client, id_vehicule, id_commercial, id_administrateur)
           VALUES (?, ?, ?, ?, ?, 0, 'EN_COURS', ?, ?, ?,
                   (SELECT id_administrateur FROM administrateur ORDER BY id_administrateur LIMIT 1))`,

          [
            `LOC-${String(Date.now()).slice(-5)}`,

            input.typeLocation === "Longue durée"
              ? "LONGUE_DUREE"
              : "COURTE_DUREE",

            sqlDateTime(input.dateDebut ?? date.toISOString()),

            sqlDateTime(input.dateFin ?? date.toISOString()),

            input.kilometrage,

            input.clientId,

            input.vehiculeId,

            input.commercialId,
          ],
        )

        locationId = Number((locationResult as mysql.ResultSetHeader).insertId)

        const movements = await query<Row>(
          connection,

          `SELECT id_mouvement FROM mouvement_vehicule
            WHERE id_location = ? AND type_mouvement = 'MISE_EN_LOCATION'
            ORDER BY id_mouvement DESC LIMIT 1`,

          [locationId],
        )

        if (movements[0]) {
          insertId = num(movements[0].id_mouvement)

          await connection.query(
            "UPDATE mouvement_vehicule SET observation = ?, id_commercial = ? WHERE id_mouvement = ?",
            [
              input.observation ?? null,

              input.commercialId ?? null,

              insertId,
            ],
          )
        } else {
          throw new Error("Le mouvement de mise en location n'a pas été créé.")
        }

        await connection.query(
          "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",

          [input.statut, input.kilometrage, input.vehiculeId],
        )
      } else if (input.statut === "RETOUR_LOCATION") {
        const [locations] = (await connection.query(
          `SELECT id_location FROM location
            WHERE id_vehicule = ? AND statut IN ('EN_COURS','EN_RETARD','EN_PROLONGATION')
            ORDER BY date_fin_prevue DESC, id_location DESC LIMIT 1 FOR UPDATE`,

          [input.vehiculeId],
        )) as unknown as [Row[], unknown]

        locationId = locations[0] ? num(locations[0].id_location) : null

        if (locationId !== null) {
          await connection.query(
            `UPDATE location
                SET statut = 'TERMINEE', date_retour_reelle = ?,
                    km_retour = ?, km_parcourus = GREATEST(0, ? - km_depart)
              WHERE id_location = ?`,

            [date, input.kilometrage, input.kilometrage, locationId],
          )

          const movements = await query<Row>(
            connection,
            `SELECT id_mouvement AS id
               FROM mouvement_vehicule
              WHERE id_location = ? AND type_mouvement = 'RETOUR_LOCATION'
              ORDER BY id_mouvement DESC
              LIMIT 1`,
            [locationId],
          )

          if (!movements[0]) {
            throw new Error(
              "Le mouvement de retour de location n'a pas été créé.",
            )
          }

          insertId = num(movements[0].id)
        }
      }

      if (
        input.statut === "ENVOI_GARAGE" ||
        input.statut === "RETOUR_GARAGE"
      ) {
        await connection.query(
          "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",
          [input.statut, input.kilometrage, input.vehiculeId],
        )
      }

      await connection.commit()

      return {
        id: insertId,

        vehiculeId: input.vehiculeId,

        locationId,

        type: input.statut,

        motif: null,

        kilometrage: input.kilometrage,

        date: date.toISOString().slice(0, 10),

        commentaire: input.observation ?? null,

        kmDepart: input.statut === "RETOUR_INTERNE" ? null : input.kilometrage,

        kmRetour:
          input.statut === "RETOUR_INTERNE" ||
          input.statut === "RETOUR_LOCATION" ||
          input.statut === "RETOUR_GARAGE"
            ? input.kilometrage
            : null,

        kmParcourus: null,

        dateRetour: null,
      }
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }

  async remove(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      const [rows] = (await connection.query(
        "SELECT id_vehicule AS vehicule_id FROM mouvement_vehicule WHERE id_mouvement = ? FOR UPDATE",

        [id],
      )) as unknown as [Row[], unknown]

      const current = rows[0]

      if (!current) {
        await connection.rollback()

        return false
      }

      await connection.query(
        "DELETE FROM mouvement_vehicule WHERE id_mouvement = ?",
        [id],
      )

      const [latest] = (await connection.query(
        `SELECT type_mouvement AS type, kilometrage
         FROM mouvement_vehicule WHERE id_vehicule = ?
         ORDER BY date_mouvement DESC, id_mouvement DESC LIMIT 1`,

        [current.vehicule_id],
      )) as unknown as [Row[], unknown]

      const next = latest[0]

      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = COALESCE(?, kilometrage) WHERE id_vehicule = ?",

        [
          next ? next.type : "ENTREE_PARC",
          next?.kilometrage ?? null,
          current.vehicule_id,
        ],
      )

      await connection.commit()

      return true
    } catch (error) {
      await connection.rollback()

      throw error
    } finally {
      connection.release()
    }
  }
}

class MysqlVenteVehiculeRepo implements VenteVehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<VenteVehicule[]> {
    let sql = "SELECT * FROM vente_vehicule"

    const params: unknown[] = []

    if (options?.q) {
      sql += " WHERE numero_vente LIKE ? OR statut LIKE ?"

      const like = `%${options.q.trim()}%`

      params.push(like, like)
    }

    sql += " ORDER BY date_vente DESC, id_vente DESC"

    if (options?.limit) {
      sql += " LIMIT ?"

      params.push(options.limit)
    }

    return (await query<Row>(this.pool, sql, params)).map(mapVenteVehicule)
  }

  async get(id: number): Promise<VenteVehicule | null> {
    const rows = await query<Row>(
      this.pool,
      "SELECT * FROM vente_vehicule WHERE id_vente = ?",
      [id],
    )

    return rows[0] ? mapVenteVehicule(rows[0]) : null
  }

  async remove(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const rows = await query<Row>(
        connection,
        `SELECT id_vehicule, id_mouvement
           FROM vente_vehicule
          WHERE id_vente = ?
          FOR UPDATE`,
        [id],
      )
      const sale = rows[0]
      if (!sale) {
        await connection.rollback()
        return false
      }

      await connection.query("DELETE FROM vente_vehicule WHERE id_vente = ?", [
        id,
      ])
      await connection.query(
        "DELETE FROM mouvement_vehicule WHERE id_mouvement = ?",
        [sale.id_mouvement],
      )
      const latest = await query<Row>(
        connection,
        `SELECT type_mouvement AS type, kilometrage
           FROM mouvement_vehicule
          WHERE id_vehicule = ?
          ORDER BY date_mouvement DESC, id_mouvement DESC
          LIMIT 1`,
        [sale.id_vehicule],
      )
      await connection.query(
        `UPDATE vehicule
            SET statut = ?, kilometrage = COALESCE(?, kilometrage)
          WHERE id_vehicule = ?`,
        [
          latest[0]?.type ?? "ENTREE_PARC",
          latest[0]?.kilometrage ?? null,
          sale.id_vehicule,
        ],
      )
      await connection.commit()
      return true
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async isMovementLinked(movementId: number): Promise<boolean> {
    const rows = await query<Row>(
      this.pool,

      `SELECT m.id_mouvement
         FROM mouvement_vehicule m
         LEFT JOIN vente_vehicule v ON v.id_mouvement = m.id_mouvement
        WHERE m.id_mouvement = ? AND (m.id_location IS NOT NULL OR v.id_vente IS NOT NULL)
        LIMIT 1`,

      [movementId],
    )

    return rows.length > 0
  }

  async create(
    input: VenteVehiculeInput,
    adminId: number,
  ): Promise<VenteVehicule> {
    const connection = await this.pool.getConnection()

    try {
      await connection.beginTransaction()

      const [vehicleRows] = (await connection.query(
        "SELECT id_vehicule, statut FROM vehicule WHERE id_vehicule = ? FOR UPDATE",

        [input.vehiculeId],
      )) as unknown as [Row[], unknown]

      const vehicle = vehicleRows[0]

      if (!vehicle) throw new Error("Véhicule introuvable")

      const [existingSales] = (await connection.query(
        "SELECT id_vente FROM vente_vehicule WHERE id_vehicule = ? AND statut = 'CONCLUE' LIMIT 1",

        [input.vehiculeId],
      )) as unknown as [Row[], unknown]

      if (existingSales.length > 0)
        throw new Error("Ce véhicule possède déjà une vente conclue")

      const [movementResult] = await connection.query(
        `INSERT INTO mouvement_vehicule
          (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule)
         VALUES ('SORTIE_DEFINITIVE', ?, ?, ?, ?)`,

        [
          sqlDateTime(input.dateVente),
          input.kilometrageVente,
          `Vente ${input.numeroVente}`,
          input.vehiculeId,
        ],
      )

      const movementId = Number(
        (movementResult as mysql.ResultSetHeader).insertId,
      )

      const [saleResult] = await connection.query(
        `INSERT INTO vente_vehicule
          (numero_vente, id_vehicule, id_acheteur, date_vente, prix_vente, devise, frais_vente,
           motif_vente, etat_vehicule, kilometrage_vente, canal_vente, statut_paiement,
           date_remise_vehicule, reference_cession, statut, id_facture, id_mouvement,
           id_commercial, id_administrateur, observation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONCLUE', ?, ?, ?, ?, ?)`,

        [
          input.numeroVente,
          input.vehiculeId,
          input.acheteurId,
          sqlDateTime(input.dateVente),
          input.prixVente,

          input.devise ?? "XOF",
          input.fraisVente ?? 0,
          input.motifVente,
          input.etatVehicule,

          input.kilometrageVente,
          input.canalVente ?? null,
          input.statutPaiement ?? "NON_PAYEE",

          input.dateRemiseVehicule
            ? sqlDateTime(input.dateRemiseVehicule)
            : null,
          input.referenceCession ?? null,
          input.factureId ?? null,

          movementId,
          input.commercialId ?? null,
          adminId,
          input.observation ?? null,
        ],
      )

      await connection.query(
        `UPDATE vehicule SET statut = 'SORTIE_DEFINITIVE', prix_vente = ?,
          date_sortie_parc = ?, kilometrage = GREATEST(kilometrage, ?)
         WHERE id_vehicule = ?`,

        [
          input.prixVente,
          sqlDateTime(input.dateVente),
          input.kilometrageVente,
          input.vehiculeId,
        ],
      )

      await connection.commit()

      const sale = await this.get(
        Number((saleResult as mysql.ResultSetHeader).insertId),
      )

      if (!sale) throw new Error("Vente créée mais introuvable")

      return sale
    } catch (error) {
      await connection.rollback().catch(() => undefined)

      throw error
    } finally {
      connection.release()
    }
  }
}

const CONTRAVENTION_SELECT = `
  SELECT c.*, t.libelle AS type_libelle, v.immatriculation,
         v.marque, v.modele,
         CONCAT_WS(' ', NULLIF(v.marque, ''), NULLIF(v.modele, ''), NULLIF(v.version, '')) AS vehicule,
         COALESCE(NULLIF(CONCAT_WS(' ', cl.prenom, cl.nom), ''), c.client_import) AS client_nom,
         COALESCE(NULLIF(CONCAT_WS(' ', co.prenom, co.nom), ''), c.commercial_import) AS commercial_nom
    FROM contravention c
    JOIN type_contravention t ON t.id_type_contravention = c.id_type_contravention
    JOIN vehicule v ON v.id_vehicule = c.id_vehicule
    LEFT JOIN client cl ON cl.id_client = c.id_client
    LEFT JOIN commercial co ON co.id_commercial = c.id_commercial`

function mapContravention(row: Row): Contravention {
  return {
    id: num(row.id_contravention),
    numeroContravention: str(row.numero_contravention),
    type: str(row.type_libelle),
    dateInfraction: str(row.date_infraction).slice(0, 10),
    montant: num(row.montant),
    frais: num(row.frais),
    devise: str(row.devise),
    statutPaiement: str(row.statut_paiement) as Contravention["statutPaiement"],
    dateReglement: strNull(row.date_reglement)?.slice(0, 10) ?? null,
    moyenPaiement: strNull(row.moyen_paiement),
    numeroQuittance: strNull(row.numero_quittance),
    payeur: strNull(row.payeur),
    statutRecouvrement: str(
      row.statut_recouvrement,
    ) as Contravention["statutRecouvrement"],
    dateRecouvrement: strNull(row.date_recouvrement)?.slice(0, 10) ?? null,
    montantRecouvre: num(row.montant_recouvre),
    fraisRecouvres: num(row.frais_recouvres),
    vehiculeId: num(row.id_vehicule),
    immatriculation: str(row.immatriculation),
    marque: str(row.marque),
    modele: str(row.modele),
    vehicule: str(row.vehicule),
    clientId: numNull(row.id_client),
    client: strNull(row.client_nom),
    clientImport: strNull(row.client_import),
    commercialId: numNull(row.id_commercial),
    commercial: strNull(row.commercial_nom),
    commercialImport: strNull(row.commercial_import),
    observation: strNull(row.observation),
  }
}

class MysqlContraventionRepo implements ContraventionRepo {
  constructor(private pool: mysql.Pool) {}

  private async ensureType(
    connection: mysql.PoolConnection,
    input: ContraventionInput,
  ): Promise<number> {
    const [result] = await connection.query(
      `INSERT INTO type_contravention (libelle, montant_standard)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         id_type_contravention = LAST_INSERT_ID(id_type_contravention)`,
      [input.type, input.montant],
    )
    const typeId = Number((result as mysql.ResultSetHeader).insertId)
    if (!typeId)
      throw new Error(`Impossible d'enregistrer le type ${input.type}`)
    return typeId
  }

  private async insert(
    connection: mysql.PoolConnection,
    input: ContraventionInput,
  ): Promise<number> {
    const typeId = await this.ensureType(connection, input)
    const [result] = await connection.query(
      `INSERT INTO contravention
         (numero_contravention, id_type_contravention, date_infraction,
          montant, frais, devise, statut_paiement, date_reglement,
          moyen_paiement, numero_quittance, payeur, statut_recouvrement,
          date_recouvrement, montant_recouvre, frais_recouvres, observation,
          id_vehicule, id_client, id_commercial, client_import, commercial_import)
       VALUES (?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.numeroContravention,
        typeId,
        input.dateInfraction,
        input.montant,
        input.frais ?? 0,
        input.statutPaiement,
        input.dateReglement ?? null,
        input.moyenPaiement ?? null,
        input.numeroQuittance ?? null,
        input.payeur ?? null,
        input.statutRecouvrement,
        input.dateRecouvrement ?? null,
        input.montantRecouvre ?? 0,
        input.fraisRecouvres ?? 0,
        input.observation ?? null,
        input.vehiculeId,
        input.clientId ?? null,
        input.commercialId ?? null,
        input.clientImport ?? null,
        input.commercialImport ?? null,
      ],
    )
    return Number((result as mysql.ResultSetHeader).insertId)
  }

  async list(options?: ListOptions): Promise<Contravention[]> {
    let sql = CONTRAVENTION_SELECT
    const params: unknown[] = []
    if (options?.q?.trim()) {
      sql += ` WHERE c.numero_contravention LIKE ?
                  OR t.libelle LIKE ?
                  OR v.immatriculation LIKE ?
                  OR c.client_import LIKE ?
                  OR c.commercial_import LIKE ?`
      const like = `%${options.q.trim()}%`
      params.push(like, like, like, like, like)
    }
    sql += " ORDER BY c.date_infraction DESC, c.id_contravention DESC"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map(mapContravention)
  }

  async get(id: number): Promise<Contravention | null> {
    const rows = await query<Row>(
      this.pool,
      `${CONTRAVENTION_SELECT} WHERE c.id_contravention = ?`,
      [id],
    )
    return rows[0] ? mapContravention(rows[0]) : null
  }

  async create(input: ContraventionInput): Promise<Contravention> {
    const id = await inTransaction(this.pool, (connection) =>
      this.insert(connection, input),
    )
    const row = await this.get(id)
    if (!row) throw new Error("Contravention créée mais introuvable")
    return row
  }

  async update(
    id: number,
    input: ContraventionInput,
  ): Promise<Contravention | null> {
    await inTransaction(this.pool, async (connection) => {
      const existing = await query<Row>(
        connection,
        "SELECT id_contravention FROM contravention WHERE id_contravention = ? FOR UPDATE",
        [id],
      )
      if (!existing[0]) return
      const typeId = await this.ensureType(connection, input)
      await connection.query(
        `UPDATE contravention
            SET numero_contravention = ?, id_type_contravention = ?,
                date_infraction = ?, montant = ?, frais = ?, statut_paiement = ?,
                date_reglement = ?, moyen_paiement = ?, numero_quittance = ?,
                payeur = ?, statut_recouvrement = ?, date_recouvrement = ?,
                montant_recouvre = ?, frais_recouvres = ?, observation = ?,
                id_vehicule = ?, id_client = ?, id_commercial = ?,
                client_import = ?, commercial_import = ?
          WHERE id_contravention = ?`,
        [
          input.numeroContravention,
          typeId,
          input.dateInfraction,
          input.montant,
          input.frais ?? 0,
          input.statutPaiement,
          input.dateReglement ?? null,
          input.moyenPaiement ?? null,
          input.numeroQuittance ?? null,
          input.payeur ?? null,
          input.statutRecouvrement,
          input.dateRecouvrement ?? null,
          input.montantRecouvre ?? 0,
          input.fraisRecouvres ?? 0,
          input.observation ?? null,
          input.vehiculeId,
          input.clientId ?? null,
          input.commercialId ?? null,
          input.clientImport ?? null,
          input.commercialImport ?? null,
          id,
        ],
      )
    })
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM contravention WHERE id_contravention = ?",
      [id],
    )
    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }

  async importMany(inputs: ContraventionInput[]): Promise<number> {
    await inTransaction(this.pool, async (connection) => {
      for (const input of inputs) await this.insert(connection, input)
    })
    return inputs.length
  }
}

class MysqlStatsRepo implements StatsRepo {
  constructor(private pool: mysql.Pool) {}

  async overview(params?: StatsPeriod): Promise<OverviewStats> {
    await new MysqlReservationRepo(this.pool).refreshStatuses()

    const dateWhere = this.statsDateWhere("date_debut", params)

    const [[ca]] = (await this.pool.query(
      `SELECT COALESCE(SUM(montant_total), 0) AS total FROM location WHERE 1 = 1 ${dateWhere}`,
    )) as unknown as Row[][]

    const [[dispo]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule WHERE statut IN ('ENTREE_PARC', 'RETOUR_LOCATION', 'RETOUR_INTERNE', 'RETOUR_GARAGE')",
    )) as unknown as Row[][]

    const [[total]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule",
    )) as unknown as Row[][]

    const [[actives]] = (await this.pool.query(
      `SELECT COUNT(*) AS n FROM location WHERE statut IN ('EN_COURS', 'EN_RETARD', 'EN_PROLONGATION') ${dateWhere}`,
    )) as unknown as Row[][]

    const [[attente]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation WHERE statut = 'A_VENIR'",
    )) as unknown as Row[][]

    const [[locCount]] = (await this.pool.query(
      `SELECT COUNT(*) AS n FROM location WHERE 1 = 1 ${dateWhere}`,
    )) as unknown as Row[][]

    const [[abouties]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation WHERE statut IN ('EN_COURS', 'TERMINEE')",
    )) as unknown as Row[][]

    const [[resaTotal]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation",
    )) as unknown as Row[][]

    const totalVeh = num((total as Row).n)

    const nbActives = num((actives as Row).n)

    const round1 = (n: number): number => Math.round(n * 10) / 10

    const [[grow]] = (await this.pool.query(
      `SELECT
          COALESCE(SUM(CASE WHEN date_debut >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN montant_total ELSE 0 END), 0) AS ca_curr,
          COALESCE(SUM(CASE WHEN date_debut >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND date_debut < DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN montant_total ELSE 0 END), 0) AS ca_prev
        FROM location
        WHERE 1 = 1 ${dateWhere}`,
    )) as unknown as Row[][]

    const caCurr = num((grow as Row).ca_curr)

    const caPrev = num((grow as Row).ca_prev)

    const caCroissance =
      caPrev > 0
        ? `${Math.round(((caCurr - caPrev) / caPrev) * 100)}%`
        : caCurr > 0
          ? "+100%"
          : "0%"

    return {
      caTotal: num((ca as Row).total),

      devise: "FCFA",

      caCroissance,

      vehiculesDisponibles: num((dispo as Row).n),

      vehiculesTotal: totalVeh,

      locationsActives: nbActives,

      reservationsEnAttente: num((attente as Row).n),

      tauxUtilisation: totalVeh > 0 ? round1((nbActives / totalVeh) * 100) : 0,

      tauxRotation:
        totalVeh > 0 ? round1(num((locCount as Row).n) / totalVeh) : 0,

      reservationsAbouties: num((abouties as Row).n),

      reservationsTotal: num((resaTotal as Row).n),
    }
  }

  async monthly(params?: StatsPeriod): Promise<MonthlyPoint[]> {
    const dateWhere = this.statsDateWhere("date_debut", params)

    const rows = (await this.pool.query(
      `SELECT DATE_FORMAT(date_debut, '%Y-%m') AS mois_key, type_location, COUNT(*) AS n
       FROM location
       WHERE date_debut >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) ${dateWhere}
       GROUP BY mois_key, type_location
       ORDER BY mois_key`,
    )) as unknown as Row[]

    const data = new Map<string, { courte: number; longue: number }>()

    for (const row of rows) {
      const key = String(row.mois_key)

      let entry = data.get(key)

      if (!entry) {
        entry = { courte: 0, longue: 0 }

        data.set(key, entry)
      }

      if (String(row.type_location) === "COURTE_DUREE") {
        entry.courte = num(row.n)
      } else {
        entry.longue = num(row.n)
      }
    }

    const stats: MonthlyPoint[] = []

    const today = new Date()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)

      const key = d.toISOString().slice(0, 7)

      const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(
        d,
      )

      const entry = data.get(key) || { courte: 0, longue: 0 }

      stats.push({ mois: label, courte: entry.courte, longue: entry.longue })
    }

    return stats
  }

  async daily(params?: StatsPeriod): Promise<DailyStat[]> {
    const dateWhere = this.statsDateWhere("date_debut", params)

    const rows = (await this.pool.query(
      `SELECT DATE(date_debut) AS date, COALESCE(SUM(montant_total), 0) AS montant
       FROM location
       WHERE date_debut >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${dateWhere}
       GROUP BY DATE(date_debut)
       ORDER BY DATE(date_debut)`,
    )) as unknown as Row[]

    const byDate = new Map<string, number>()

    for (const row of rows) {
      byDate.set(String(row.date), num(row.montant))
    }

    const stats: DailyStat[] = []

    const today = new Date()

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)

      d.setDate(today.getDate() - i)

      const iso = d.toISOString().slice(0, 10)

      stats.push({ date: iso, montant: byDate.get(iso) ?? 0 })
    }

    return stats
  }

  async fleetStatus(): Promise<FleetStatus> {
    const rows = (await this.pool.query(
      "SELECT statut, COUNT(*) AS n FROM vehicule GROUP BY statut",
    )) as unknown as Row[]

    const counts = new Map<string, number>()

    for (const row of rows) {
      counts.set(String(row.statut), num(row.n))
    }

    const disponible =
      (counts.get("ENTREE_PARC") ?? 0) +
      (counts.get("RETOUR_LOCATION") ?? 0) +
      (counts.get("RETOUR_INTERNE") ?? 0) +
      (counts.get("RETOUR_GARAGE") ?? 0)

    return {
      disponible,

      enLocation: counts.get("MISE_EN_LOCATION") ?? 0,

      entretien: counts.get("ENVOI_GARAGE") ?? 0,

      indisponible:
        (counts.get("SORTIE_INTERNE") ?? 0) +
        (counts.get("SORTIE_DEFINITIVE") ?? 0) +
        (counts.get("RESERVATION") ?? 0),
    }
  }

  async immobilisationsSinistres(): Promise<SinistreImmobilisation[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_vehicule AS vehicule_id, date_sinistre AS date_debut,
              date_cloture AS date_fin
         FROM sinistre
        WHERE immobilisant = 1`,
    )
    return rows.map((row) => ({
      vehiculeId: num(row.vehicule_id),
      dateDebut: str(row.date_debut).slice(0, 10),
      dateFin: row.date_fin ? str(row.date_fin).slice(0, 10) : null,
    }))
  }

  private statsDateWhere(column: string, params?: StatsPeriod): string {
    const clauses: string[] = []

    if (params?.debut) clauses.push(`${column} >= '${params.debut}'`)

    if (params?.fin) clauses.push(`${column} <= '${params.fin}'`)

    if (clauses.length === 0) return ""

    return `AND ${clauses.join(" AND ")}`
  }
}

export function mysqlRepositories(pool: mysql.Pool): Repositories {
  return {
    admins: new MysqlAdminRepo(pool),

    agences: new MysqlAgenceRepo(pool),

    vehicules: new MysqlVehiculeRepo(pool),

    categories: new MysqlCategorieRepo(pool),

    modeles: new MysqlModeleRepo(pool),

    centres: new MysqlCentreRepo(pool),

    conducteurs: new MysqlConducteurRepo(pool),

    garages: new MysqlGarageRepo(pool),

    passagesGarage: new MysqlPassageGarageRepo(pool),

    reparations: new MysqlReparationRepo(pool),

    clients: new MysqlClientRepo(pool),

    commerciaux: new MysqlCommercialRepo(pool),

    locations: new MysqlLocationRepo(pool),

    prolongations: new MysqlProlongationRepo(pool),

    reservations: new MysqlReservationRepo(pool),

    maintenances: new MysqlMaintenanceRepo(pool),

    mouvements: new MysqlMouvementRepo(pool),

    ventesVehicules: new MysqlVenteVehiculeRepo(pool),

    contraventions: new MysqlContraventionRepo(pool),

    stats: new MysqlStatsRepo(pool),
  }
}
