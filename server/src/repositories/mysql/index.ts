import type mysql from "mysql2/promise"
import type {
  Admin,
  AdminRecord,
  AdminRepo,
  Client,
  ClientFiche,
  ClientInput,
  ClientUpdateInput,
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialInput,
  CommercialRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationInput,
  LocationRepo,
  Maintenance,
  MaintenanceRepo,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  Repositories,
  Reservation,
  ReservationInput,
  ReservationFiche,
  ReservationRepo,
  StatsRepo,
  Vehicule,
  VehiculeInput,
  VehiculeRepo,
} from "../types.js"
import { AvailabilityConflictError, performanceOf } from "../helpers.js"

type Row = Record<string, unknown>

const num = (v: unknown): number => Number(v ?? 0)
const str = (v: unknown): string => String(v ?? "")
const strNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const numNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

function clientFromRow(r: Row): Client {
  return {
    id: num(r.id),
    nom: str(r.nom),
    nomFamille: strNull(r.nom_famille) ?? undefined,
    prenom: strNull(r.prenom),
    type: clientType(r.type),
    telephone: str(r.telephone),
    email: strNull(r.email),
    adresse: strNull(r.adresse),
    numPermis: strNull(r.num_permis),
  }
}

function commercialFromRow(r: Row): Commercial {
  return {
    id: num(r.id),
    nom: str(r.nom),
    nomFamille: strNull(r.nom_famille) ?? undefined,
    prenom: strNull(r.prenom),
    abreviation: strNull(r.abreviation),
    telephone: strNull(r.telephone),
    email: strNull(r.email),
    contact: [strNull(r.telephone), strNull(r.email)].filter(Boolean).join(" · "),
    actif: Boolean(num(r.actif)),
  }
}

function vehiculeStatus(value: unknown): Vehicule["statut"] {
  switch (String(value).toUpperCase()) {
    case "DISPONIBLE":
      return "Disponible"
    case "LOUE":
      return "En location"
    case "AU_GARAGE":
      return "Entretien"
    case "EN_SORTIE":
    case "IMMOBILISE":
    case "VENDU":
      return "Indisponible"
    default:
      throw new Error(`Statut de véhicule MySQL inconnu : ${String(value)}`)
  }
}

function dbVehiculeStatus(value: Vehicule["statut"]): string {
  switch (value) {
    case "Disponible":
      return "DISPONIBLE"
    case "En location":
      return "LOUE"
    case "Entretien":
      return "AU_GARAGE"
    case "Indisponible":
      return "IMMOBILISE"
  }
}

function clientType(value: unknown): Client["type"] {
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

function locationType(value: unknown): Location["type"] {
  switch (String(value).toUpperCase()) {
    case "COURTE_DUREE":
      return "Courte durée"
    case "LONGUE_DUREE":
      return "Longue durée"
    default:
      throw new Error(`Type de location MySQL inconnu : ${String(value)}`)
  }
}

function locationStatus(value: unknown): Location["statut"] {
  switch (String(value).toUpperCase()) {
    case "EN_COURS":
      return "En cours"
    case "TERMINEE":
      return "Retourné"
    case "EN_RETARD":
      return "En retard"
    default:
      throw new Error(`Statut de location MySQL inconnu : ${String(value)}`)
  }
}

function reservationStatus(value: unknown): Reservation["statut"] {
  switch (String(value).toUpperCase()) {
    case "EN_ATTENTE":
      return "En attente"
    case "CONFIRMEE":
      return "Confirmée"
    case "TRANSFORMEE_EN_LOCATION":
      return "Aboutie"
    case "REPORTEE":
      return "Reportée"
    case "EXPIREE":
      return "Expirée"
    case "ANNULEE":
      return "Annulée"
    default:
      throw new Error(`Statut de réservation MySQL inconnu : ${String(value)}`)
  }
}

function mapVehicule(r: Row): Vehicule {
  return {
    id: num(r.id),
    immatriculation: str(r.immatriculation),
    marqueModele: str(r.marque_modele),
    categorie: str(r.categorie),
    kilometrage: num(r.kilometrage),
    statut: vehiculeStatus(r.statut),
  }
}

function mapLocation(r: Row): Location {
  return {
    id: num(r.id),
    reference: str(r.reference),
    clientId: num(r.client_id),
    vehiculeId: num(r.vehicule_id),
    commercialId: numNull(r.commercial_id),
    type: locationType(r.type),
    dateDebut: str(r.date_debut).slice(0, 10),
    dateFin: str(r.date_fin).slice(0, 10),
    montant: num(r.montant),
    statut: locationStatus(r.statut),
  }
}

function mapReservation(r: Row): Reservation {
  return {
    id: num(r.id),
    reference: str(r.reference),
    clientId: num(r.client_id),
    vehiculeId: numNull(r.vehicule_id),
    commercialId: numNull(r.commercial_id),
    dateDepart: str(r.date_depart).slice(0, 10),
    dureeJours: Math.max(1, num(r.duree_jours)),
    statut: reservationStatus(r.statut),
  }
}

function mapMaintenance(r: Row): Maintenance {
  const statut = String(r.statut).toUpperCase()
  if (statut !== "EN_ATTENTE" && statut !== "EN_COURS" && statut !== "TERMINEE") {
    throw new Error(`Statut de passage garage MySQL inconnu : ${String(r.statut)}`)
  }
  return {
    id: num(r.id),
    vehiculeId: num(r.vehicule_id),
    dateEntree: str(r.date_entree).slice(0, 10),
    dateSortie: r.date_sortie ? str(r.date_sortie).slice(0, 10) : null,
    motif: str(r.motif),
    cout: num(r.cout),
    remplacementId: numNull(r.remplacement_id),
    statut: statut === "TERMINEE" ? "Terminée" : "En cours",
  }
}

function mouvementType(value: unknown): Mouvement["type"] {
  switch (String(value).toUpperCase()) {
    case "ENTREE_PARC":
      return "Acquisition"
    case "MISE_EN_LOCATION":
      return "Mise en location"
    case "RETOUR_LOCATION":
      return "Retour"
    case "ENVOI_GARAGE":
    case "RETOUR_GARAGE":
      return "Maintenance"
    case "SORTIE_DEFINITIVE":
      return "Vente"
    case "SORTIE_INTERNE":
      return "Sortie interne"
    case "RETOUR_INTERNE":
      return "Retour interne"
    default:
      throw new Error(`Type de mouvement MySQL inconnu : ${String(value)}`)
  }
}

const VEHICLE_SELECT = `SELECT v.id_vehicule AS id,
                               v.immatriculation,
                               CONCAT_WS(' ', NULLIF(v.marque, ''), NULLIF(v.modele, ''), NULLIF(v.version, '')) AS marque_modele,
                               COALESCE(c.libelle, v.segment_parc) AS categorie,
                               v.kilometrage,
                               v.statut
                          FROM vehicule v
                          LEFT JOIN categorie_vehicule c ON c.id_categorie = v.id_categorie`

async function findVehicleModel(
  pool: mysql.Pool,
  marqueModele: string,
  categorie: string,
): Promise<{ marque: string; modele: string; categorieId: number } | null> {
  const rows = await query<Row>(
    pool,
    `SELECT m.marque, m.nom AS modele, c.id_categorie AS categorie_id
       FROM modele_vehicule m
       JOIN categorie_vehicule c ON c.id_categorie = m.id_categorie
      WHERE UPPER(CONCAT(m.marque, ' ', m.nom)) = UPPER(?)
        AND c.libelle = ?
      LIMIT 1`,
    [marqueModele.trim(), categorie.trim()],
  )
  const row = rows[0]
  return row
    ? { marque: str(row.marque), modele: str(row.modele), categorieId: num(row.categorie_id) }
    : null
}

const LOCATION_SELECT = `SELECT l.id_location AS id,
                                COALESCE(NULLIF(l.numero_contrat, ''), CONCAT('LOC-', l.id_location)) AS reference,
                                l.id_client AS client_id,
                                l.id_vehicule AS vehicule_id,
                                l.id_commercial AS commercial_id,
                                l.type_location AS type,
                                l.date_debut,
                                l.date_fin_prevue AS date_fin,
                                l.montant_total AS montant,
                                l.statut
                           FROM location l`

const RESERVATION_SELECT = `SELECT r.id_reservation AS id,
                                   COALESCE(NULLIF(r.ref_proforma, ''), NULLIF(r.ref_bon_commande, ''),
                                            CONCAT('RES-', r.id_reservation)) AS reference,
                                   r.id_client AS client_id,
                                   r.id_vehicule AS vehicule_id,
                                   r.id_commercial AS commercial_id,
                                   COALESCE(r.date_debut_prevue, r.date_reservation) AS date_depart,
                                   COALESCE(r.duree_jours, 1) AS duree_jours,
                                   r.statut
                              FROM reservation r`

async function query<T>(
  pool: mysql.Pool | mysql.PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query(sql, params)
  return rows as T[]
}

async function assertVehicleAvailable(
  connection: mysql.PoolConnection,
  vehiculeId: number,
  debut: string,
  fin: string,
): Promise<void> {
  const vehicles = await query<Row>(
    connection,
    "SELECT statut FROM vehicule WHERE id_vehicule = ? FOR UPDATE",
    [vehiculeId],
  )
  if (!vehicles[0]) throw new Error("Véhicule introuvable")
  if (["IMMOBILISE", "EN_SORTIE", "VENDU"].includes(str(vehicles[0].statut))) {
    throw new AvailabilityConflictError("Véhicule indisponible pour la location")
  }

  const garages = await query<Row>(
    connection,
    `SELECT id_passage, motif
       FROM passage_garage
      WHERE id_vehicule = ?
        AND statut IN ('EN_ATTENTE', 'EN_COURS')
        AND date_entree <= ?
        AND COALESCE(date_sortie_reelle, date_sortie_prevue, '9999-12-31') >= ?
      LIMIT 1`,
    [vehiculeId, fin, debut],
  )
  if (garages[0]) {
    throw new AvailabilityConflictError(
      `Véhicule au garage sur la période${garages[0].motif ? ` (${str(garages[0].motif)})` : ""}`,
    )
  }

  const locations = await query<Row>(
    connection,
    `SELECT id_location
       FROM location
      WHERE id_vehicule = ?
        AND statut IN ('EN_COURS', 'EN_RETARD')
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
        AND statut IN ('EN_ATTENTE', 'CONFIRMEE')
        AND date_debut_prevue <= ?
        AND date_fin_prevue >= ?
      LIMIT 1`,
    [vehiculeId, fin, debut],
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

class MysqlAdminRepo implements AdminRepo {
  constructor(private pool: mysql.Pool) {}

  async findByEmail(email: string): Promise<AdminRecord | null> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_administrateur AS id,
              CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              email, mot_de_passe_hash AS password_hash
         FROM administrateur
        WHERE email = ? AND actif = 1`,
      [email.trim()],
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: num(r.id),
      nom: str(r.nom),
      email: str(r.email),
      role: "responsable",
      passwordHash: str(r.password_hash),
    }
  }

  async findById(id: number): Promise<Admin | null> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_administrateur AS id,
              CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              email
         FROM administrateur
        WHERE id_administrateur = ? AND actif = 1`,
      [id],
    )
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), email: str(r.email), role: "responsable" }
  }
}

class MysqlVehiculeRepo implements VehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Vehicule[]> {
    let sql = VEHICLE_SELECT
    const params: unknown[] = []
    if (options?.q) {
      sql += ` WHERE v.immatriculation LIKE ?
                  OR CONCAT_WS(' ', v.marque, v.modele, v.version) LIKE ?
                  OR c.libelle LIKE ?`
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
    const rows = await query<Row>(this.pool, `${VEHICLE_SELECT} WHERE v.id_vehicule = ?`, [id])
    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async findByImmatriculation(immat: string): Promise<Vehicule | null> {
    const rows = await query<Row>(
      this.pool,
      `${VEHICLE_SELECT}
        WHERE UPPER(REPLACE(REPLACE(v.immatriculation, ' ', ''), '-', '')) =
              UPPER(REPLACE(REPLACE(?, ' ', ''), '-', ''))`,
      [immat],
    )
    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async create(input: VehiculeInput, adminId: number): Promise<Vehicule> {
    const model = await findVehicleModel(this.pool, input.marqueModele, input.categorie)
    if (!model) throw new Error("Modèle et catégorie introuvables dans le référentiel véhicule")
    const [result] = await this.pool.query(
      `INSERT INTO vehicule
         (immatriculation, marque, modele, kilometrage, statut, id_categorie, id_administrateur)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.immatriculation.trim(),
        model.marque,
        model.modele,
        input.kilometrage,
        dbVehiculeStatus(input.statut),
        model.categorieId,
        adminId,
      ],
    )
    const id = (result as { insertId: number }).insertId
    const created = await this.get(id)
    if (!created) throw new Error("Véhicule créé introuvable")
    return created
  }

  async update(id: number, input: Partial<VehiculeInput>): Promise<Vehicule | null> {
    const sets: string[] = []
    const params: unknown[] = []
    if (input.immatriculation !== undefined) {
      sets.push("immatriculation = ?")
      params.push(input.immatriculation.trim())
    }
    if (input.marqueModele !== undefined) {
      if (input.categorie === undefined) {
        throw new Error("La catégorie est requise pour modifier le modèle du véhicule")
      }
      const model = await findVehicleModel(this.pool, input.marqueModele, input.categorie)
      if (!model) throw new Error("Modèle et catégorie introuvables dans le référentiel véhicule")
      sets.push("marque = ?", "modele = ?", "id_categorie = ?")
      params.push(model.marque, model.modele, model.categorieId)
    }
    if (input.categorie !== undefined && input.marqueModele === undefined) {
      const rows = await query<Row>(
        this.pool,
        "SELECT id_categorie FROM categorie_vehicule WHERE libelle = ?",
        [input.categorie.trim()],
      )
      if (!rows[0]) throw new Error("Catégorie introuvable dans le référentiel véhicule")
      sets.push("id_categorie = ?")
      params.push(num(rows[0].id_categorie))
    }
    if (input.kilometrage !== undefined) {
      sets.push("kilometrage = ?")
      params.push(input.kilometrage)
    }
    if (input.statut !== undefined) {
      sets.push("statut = ?")
      params.push(dbVehiculeStatus(input.statut))
    }
    if (sets.length === 0) return this.get(id)
    await this.pool.query(
      `UPDATE vehicule SET ${sets.join(", ")} WHERE id_vehicule = ?`,
      [...params, id],
    )
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM vehicule WHERE id_vehicule = ?", [id])
    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlClientRepo implements ClientRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Client[]> {
    let sql =
      `SELECT id_client AS id, CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              nom AS nom_famille, prenom,
              type_client AS type, telephone, email, adresse, num_permis
         FROM client`
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE CONCAT_WS(' ', prenom, nom) LIKE ? OR telephone LIKE ? OR email LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like, like)
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map(clientFromRow)
  }

  async get(id: number): Promise<Client | null> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_client AS id, CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              nom AS nom_famille, prenom,
              type_client AS type, telephone, email, adresse, num_permis
         FROM client WHERE id_client = ?`,
      [id],
    )
    const r = rows[0]
    if (!r) return null
    return clientFromRow(r)
  }

  async fiches(): Promise<ClientFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id_client AS id,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS nom,
              c.nom AS nom_famille, c.prenom,
              c.type_client AS type, c.telephone,
              COUNT(l.id_location) AS locations_count,
              MAX(l.date_fin_prevue) AS derniere
         FROM client c
         LEFT JOIN location l ON l.id_client = c.id_client
        GROUP BY c.id_client
        ORDER BY c.id_client`,
    )
    return rows.map((r) => ({
      ...clientFromRow(r),
      locationsCount: num(r.locations_count),
      derniereOperation: r.derniere ? str(r.derniere).slice(0, 10).split("-").reverse().join("/") : null,
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
    const id = (result as { insertId: number }).insertId
    const created = await this.get(id)
    if (!created) throw new Error("Client créé introuvable")
    return created
  }

  async update(id: number, input: ClientUpdateInput): Promise<Client | null> {
    const [result] = await this.pool.query(
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
    if ((result as { affectedRows: number }).affectedRows === 0) return this.get(id)
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM client WHERE id_client = ?", [id])
    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlCommercialRepo implements CommercialRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Commercial[]> {
    let sql = `SELECT id_commercial AS id,
                      CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
                      nom AS nom_famille,
                      CONCAT_WS(' · ', NULLIF(telephone, ''), NULLIF(email, '')) AS contact,
                      prenom, abreviation, telephone, email, actif
                 FROM commercial`
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE actif = 1 AND (CONCAT_WS(' ', prenom, nom) LIKE ? OR telephone LIKE ? OR email LIKE ?)"
      const like = `%${options.q.trim()}%`
      params.push(like, like, like)
    } else {
      sql += " WHERE actif = 1"
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map(commercialFromRow)
  }

  async get(id: number): Promise<Commercial | null> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_commercial AS id,
              CONCAT_WS(' ', NULLIF(prenom, ''), nom) AS nom,
              nom AS nom_famille,
              CONCAT_WS(' · ', NULLIF(telephone, ''), NULLIF(email, '')) AS contact,
              prenom, abreviation, telephone, email, actif
         FROM commercial
        WHERE id_commercial = ? AND actif = 1`,
      [id],
    )
    const r = rows[0]
    if (!r) return null
    return commercialFromRow(r)
  }

  async fiches(): Promise<CommercialFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id_commercial AS id,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS nom,
              c.nom AS nom_famille,
              CONCAT_WS(' · ', NULLIF(c.telephone, ''), NULLIF(c.email, '')) AS contact,
              c.prenom, c.abreviation, c.telephone, c.email, c.actif,
              COUNT(l.id_location) AS conclues,
              COALESCE(SUM(l.montant_total), 0) AS ca
         FROM commercial c
         LEFT JOIN location l ON l.id_commercial = c.id_commercial
        WHERE c.actif = 1
        GROUP BY c.id_commercial
        ORDER BY c.id_commercial`,
    )
    return rows.map((r) => {
      const conclues = num(r.conclues)
      return {
        ...commercialFromRow(r),
        locationsConclues: conclues,
        chiffreAffaires: num(r.ca),
        performance: performanceOf(conclues),
      }
    })
  }

  async create(input: CommercialInput, adminId: number): Promise<Commercial> {
    const [result] = await this.pool.query(
      `INSERT INTO commercial (nom, prenom, abreviation, telephone, email, id_administrateur)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.nom,
        input.prenom || null,
        input.abreviation || null,
        input.telephone || null,
        input.email || null,
        adminId,
      ],
    )
    const id = (result as { insertId: number }).insertId
    const created = await this.get(id)
    if (!created) throw new Error("Commercial créé introuvable")
    return created
  }

  async update(id: number, input: CommercialInput): Promise<Commercial | null> {
    await this.pool.query(
      `UPDATE commercial
          SET nom = ?, prenom = ?, abreviation = ?, telephone = ?, email = ?
        WHERE id_commercial = ? AND actif = 1`,
      [
        input.nom,
        input.prenom || null,
        input.abreviation || null,
        input.telephone || null,
        input.email || null,
        id,
      ],
    )
    return this.get(id)
  }

  async deactivate(id: number): Promise<boolean> {
    const [result] = await this.pool.query(
      "UPDATE commercial SET actif = 0 WHERE id_commercial = ? AND actif = 1",
      [id],
    )
    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlLocationRepo implements LocationRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Location[]> {
    let sql = LOCATION_SELECT
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE COALESCE(l.numero_contrat, CONCAT('LOC-', l.id_location)) LIKE ? OR l.statut LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY l.id_location"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map(mapLocation)
  }

  async fiches(limit?: number): Promise<LocationFiche[]> {
    let sql = `SELECT l.id_location AS id,
                      COALESCE(NULLIF(l.numero_contrat, ''), CONCAT('LOC-', l.id_location)) AS reference,
                      l.id_client AS client_id, l.id_vehicule AS vehicule_id,
                      l.id_commercial AS commercial_id, l.type_location AS type,
                      l.date_debut, l.date_fin_prevue AS date_fin,
                      l.montant_total AS montant, l.statut,
                      CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
                      CONCAT_WS(' ', NULLIF(v.marque, ''), NULLIF(v.modele, ''), NULLIF(v.version, '')) AS vehicule_nom
                 FROM location l
                 JOIN client c ON c.id_client = l.id_client
                 JOIN vehicule v ON v.id_vehicule = l.id_vehicule
                ORDER BY l.id_location`
    const params: unknown[] = []
    if (limit) {
      sql += " LIMIT ?"
      params.push(limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({ ...mapLocation(r), client: str(r.client_nom), vehicule: str(r.vehicule_nom) }))
  }

  async get(id: number): Promise<Location | null> {
    const rows = await query<Row>(this.pool, `${LOCATION_SELECT} WHERE l.id_location = ?`, [id])
    return rows[0] ? mapLocation(rows[0]) : null
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT l.id_location AS id,
              COALESCE(NULLIF(l.numero_contrat, ''), CONCAT('LOC-', l.id_location)) AS reference,
              l.id_client AS client_id, l.id_vehicule AS vehicule_id,
              l.id_commercial AS commercial_id, l.type_location AS type,
              l.date_debut, l.date_fin_prevue AS date_fin,
              l.montant_total AS montant, l.statut,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
              CONCAT_WS(' ', NULLIF(v.marque, ''), NULLIF(v.modele, ''), NULLIF(v.version, '')) AS vehicule_nom
         FROM location l
         JOIN client c ON c.id_client = l.id_client
         JOIN vehicule v ON v.id_vehicule = l.id_vehicule
        WHERE l.id_client = ?
        ORDER BY l.date_fin_prevue DESC`,
      [clientId],
    )
    return rows.map((r) => ({ ...mapLocation(r), client: str(r.client_nom), vehicule: str(r.vehicule_nom) }))
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]> {
    const rows = await query<Row>(
      this.pool,
      `${LOCATION_SELECT}
        WHERE l.id_vehicule = ?
          AND l.statut IN ('EN_COURS', 'EN_RETARD')
          AND l.date_debut <= ?
          AND (l.date_fin_prevue >= ?
               OR (l.statut = 'EN_RETARD' AND ? >= CURDATE()))
        ORDER BY l.date_debut`,
      [vehiculeId, fin, debut, debut],
    )
    return rows.map(mapLocation)
  }

  async create(input: LocationInput, adminId: number): Promise<Location> {
    const start = new Date(`${input.dateDebut}T00:00:00Z`)
    const end = new Date(`${input.dateFin}T00:00:00Z`)
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
    const months = Math.max(
      1,
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        end.getUTCMonth() -
        start.getUTCMonth() +
        (end.getUTCDate() > start.getUTCDate() ? 1 : 0),
    )

    const id = await inTransaction(this.pool, async (connection) => {
      await assertVehicleAvailable(connection, input.vehiculeId, input.dateDebut, input.dateFin)
      const vehicles = await query<Row>(
        connection,
        "SELECT kilometrage FROM vehicule WHERE id_vehicule = ?",
        [input.vehiculeId],
      )
      const [result] = await connection.query(
        `INSERT INTO location
           (type_location, date_debut, date_fin_prevue, km_depart, montant_total,
            id_client, id_vehicule, id_commercial, id_administrateur)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.type === "Courte durée" ? "COURTE_DUREE" : "LONGUE_DUREE",
          `${input.dateDebut} 00:00:00`,
          `${input.dateFin} 23:59:59`,
          num(vehicles[0]?.kilometrage),
          input.montant,
          input.clientId,
          input.vehiculeId,
          input.commercialId,
          adminId,
        ],
      )
      const locationId = (result as { insertId: number }).insertId
      if (input.type === "Courte durée") {
        await connection.query(
          `INSERT INTO location_courte_duree
             (id_location, nb_jours, tarif_journalier_applique)
           VALUES (?, ?, ?)`,
          [locationId, days, input.montant / days],
        )
      } else {
        await connection.query(
          `INSERT INTO location_longue_duree
             (id_location, duree_mois, loyer_mensuel)
           VALUES (?, ?, ?)`,
          [locationId, months, input.montant / months],
        )
      }
      return locationId
    })

    const created = await this.get(id)
    if (!created) throw new Error("Location créée introuvable")
    return created
  }
}

class MysqlReservationRepo implements ReservationRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Reservation[]> {
    let sql = RESERVATION_SELECT
    const params: unknown[] = []
    if (options?.q) {
      sql += ` WHERE r.ref_proforma LIKE ? OR r.ref_bon_commande LIKE ?
                  OR r.statut LIKE ?`
      const like = `%${options.q.trim()}%`
      params.push(like, like, like)
    }
    sql += " ORDER BY r.id_reservation"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map(mapReservation)
  }

  async fiches(): Promise<ReservationFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT r.id_reservation AS id,
              COALESCE(NULLIF(r.ref_proforma, ''), NULLIF(r.ref_bon_commande, ''),
                       CONCAT('RES-', r.id_reservation)) AS reference,
              r.id_client AS client_id, r.id_vehicule AS vehicule_id,
              r.id_commercial AS commercial_id,
              COALESCE(r.date_debut_prevue, r.date_reservation) AS date_depart,
              COALESCE(r.duree_jours, 1) AS duree_jours, r.statut,
              CONCAT_WS(' ', NULLIF(c.prenom, ''), c.nom) AS client_nom,
              CONCAT_WS(' ', NULLIF(co.prenom, ''), co.nom) AS commercial_nom
         FROM reservation r
         JOIN client c ON c.id_client = r.id_client
         LEFT JOIN commercial co ON co.id_commercial = r.id_commercial
        ORDER BY r.id_reservation`,
    )
    return rows.map((r) => ({
      ...mapReservation(r),
      client: str(r.client_nom),
      commercial: strNull(r.commercial_nom),
    }))
  }

  async get(id: number): Promise<Reservation | null> {
    const rows = await query<Row>(
      this.pool,
      `${RESERVATION_SELECT} WHERE r.id_reservation = ?`,
      [id],
    )
    return rows[0] ? mapReservation(rows[0]) : null
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]> {
    const rows = await query<Row>(
      this.pool,
      `${RESERVATION_SELECT}
        WHERE r.id_vehicule = ?
          AND r.statut IN ('EN_ATTENTE', 'CONFIRMEE')
          AND r.date_debut_prevue IS NOT NULL
          AND r.date_fin_prevue IS NOT NULL
          AND r.date_debut_prevue <= ?
          AND r.date_fin_prevue >= ?
        ORDER BY r.date_debut_prevue`,
      [vehiculeId, fin, debut],
    )
    return rows.map(mapReservation)
  }

  async create(input: ReservationInput): Promise<Reservation> {
    const id = await inTransaction(this.pool, async (connection) => {
      await assertVehicleAvailable(connection, input.vehiculeId, input.dateDepart, input.dateFin)
      const [result] = await connection.query(
        `INSERT INTO reservation
           (date_debut_prevue, date_fin_prevue, id_client, id_vehicule, id_commercial)
         VALUES (?, ?, ?, ?, ?)`,
        [input.dateDepart, input.dateFin, input.clientId, input.vehiculeId, input.commercialId],
      )
      return (result as { insertId: number }).insertId
    })
    const created = await this.get(id)
    if (!created) throw new Error("Réservation créée introuvable")
    return created
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

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Maintenance[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_passage AS id, id_vehicule AS vehicule_id, date_entree,
              date_sortie_reelle AS date_sortie, motif, cout_total AS cout,
              id_vehicule_remplacement AS remplacement_id, statut
         FROM passage_garage
        WHERE id_vehicule = ?
          AND statut IN ('EN_ATTENTE', 'EN_COURS')
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
    let sql = `SELECT id_mouvement AS id, id_vehicule AS vehicule_id,
                      type_mouvement AS type, date_mouvement AS date,
                      observation AS commentaire
                 FROM mouvement_vehicule`
    const params: unknown[] = []
    if (vehiculeId !== undefined) {
      sql += " WHERE id_vehicule = ?"
      params.push(vehiculeId)
    }
    sql += " ORDER BY date_mouvement DESC, id_mouvement DESC"
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({
      id: num(r.id),
      vehiculeId: num(r.vehicule_id),
      type: mouvementType(r.type),
      date: str(r.date).slice(0, 10),
      commentaire: strNull(r.commentaire),
    }))
  }
}

class MysqlStatsRepo implements StatsRepo {
  constructor(private pool: mysql.Pool) {}

  async overview(): Promise<OverviewStats> {
    const [[ca]] = (await this.pool.query(
      "SELECT COALESCE(SUM(montant_total), 0) AS total FROM location",
    )) as unknown as Row[][]
    const [[dispo]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule WHERE statut = 'DISPONIBLE'",
    )) as unknown as Row[][]
    const [[total]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule",
    )) as unknown as Row[][]
    const [[actives]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM location WHERE statut IN ('EN_COURS', 'EN_RETARD')",
    )) as unknown as Row[][]
    const [[attente]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation WHERE statut = 'EN_ATTENTE'",
    )) as unknown as Row[][]
    const [[locCount]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM location",
    )) as unknown as Row[][]
    const [[abouties]] = (await this.pool.query(
      `SELECT COUNT(DISTINCT r.id_reservation) AS n
         FROM reservation r
         LEFT JOIN location l ON l.id_reservation = r.id_reservation
        WHERE r.statut = 'TRANSFORMEE_EN_LOCATION' OR l.id_location IS NOT NULL`,
    )) as unknown as Row[][]
    const [[resaTotal]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation",
    )) as unknown as Row[][]
    const totalVeh = num((total as Row).n)
    const nbActives = num((actives as Row).n)
    const round1 = (n: number): number => Math.round(n * 10) / 10
    return {
      caTotal: num((ca as Row).total),
      devise: "FCFA",
      caCroissance: "+12,6%",
      vehiculesDisponibles: num((dispo as Row).n),
      vehiculesTotal: totalVeh,
      locationsActives: nbActives,
      reservationsEnAttente: num((attente as Row).n),
      tauxUtilisation: totalVeh > 0 ? round1((nbActives / totalVeh) * 100) : 0,
      tauxRotation: totalVeh > 0 ? round1(num((locCount as Row).n) / totalVeh) : 0,
      reservationsAbouties: num((abouties as Row).n),
      reservationsTotal: num((resaTotal as Row).n),
    }
  }

  async monthly(): Promise<MonthlyPoint[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT MONTH(date_debut) AS mois,
              SUM(type_location = 'COURTE_DUREE') AS courte,
              SUM(type_location = 'LONGUE_DUREE') AS longue
         FROM location
        WHERE YEAR(date_debut) = YEAR(CURRENT_DATE)
        GROUP BY MONTH(date_debut)
        ORDER BY MONTH(date_debut)`,
    )
    const values = new Map(rows.map((row) => [num(row.mois), row]))
    const currentMonth = new Date().getMonth() + 1
    const firstMonth = Math.max(1, currentMonth - 5)
    return Array.from({ length: currentMonth - firstMonth + 1 }, (_, index) => {
      const month = firstMonth + index
      const row = values.get(month)
      return {
        mois: new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
          .format(new Date(Date.UTC(2020, month - 1, 1)))
          .replace(".", ""),
        courte: num(row?.courte),
        longue: num(row?.longue),
      }
    })
  }
}

export function mysqlRepositories(pool: mysql.Pool): Repositories {
  return {
    admins: new MysqlAdminRepo(pool),
    vehicules: new MysqlVehiculeRepo(pool),
    clients: new MysqlClientRepo(pool),
    commerciaux: new MysqlCommercialRepo(pool),
    locations: new MysqlLocationRepo(pool),
    reservations: new MysqlReservationRepo(pool),
    maintenances: new MysqlMaintenanceRepo(pool),
    mouvements: new MysqlMouvementRepo(pool),
    stats: new MysqlStatsRepo(pool),
  }
}
