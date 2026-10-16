import type mysql from "mysql2/promise"
import type {
  Admin,
  AdminRecord,
  AdminRepo,
  Client,
  ClientFiche,
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationRepo,
  Maintenance,
  MaintenanceRepo,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  Repositories,
  Reservation,
  ReservationFiche,
  ReservationRepo,
  StatsRepo,
  Vehicule,
  VehiculeInput,
  VehiculeRepo,
} from "../types.js"
import { addDays, overlaps, performanceOf } from "../helpers.js"

type Row = Record<string, unknown>

const num = (v: unknown): number => Number(v ?? 0)
const str = (v: unknown): string => String(v ?? "")
const strNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const numNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

function mapVehicule(r: Row): Vehicule {
  return {
    id: num(r.id),
    immatriculation: str(r.immatriculation),
    marqueModele: str(r.marque_modele),
    categorie: str(r.categorie),
    kilometrage: num(r.kilometrage),
    statut: r.statut as Vehicule["statut"],
  }
}

function mapLocation(r: Row): Location {
  return {
    id: num(r.id),
    reference: str(r.reference),
    clientId: num(r.client_id),
    vehiculeId: num(r.vehicule_id),
    commercialId: numNull(r.commercial_id),
    type: r.type as Location["type"],
    dateDebut: str(r.date_debut).slice(0, 10),
    dateFin: str(r.date_fin).slice(0, 10),
    montant: num(r.montant),
    statut: r.statut as Location["statut"],
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
    dureeJours: num(r.duree_jours),
    statut: r.statut as Reservation["statut"],
  }
}

async function query<T>(pool: mysql.Pool, sql: string, params: unknown[] = []): Promise<T[]> {
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

  async findByEmail(email: string): Promise<AdminRecord | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM administrateur WHERE email = ?", [
      email.trim(),
    ])
    const r = rows[0]
    if (!r) return null
    return {
      id: num(r.id),
      nom: str(r.nom),
      email: str(r.email),
      role: r.role as AdminRecord["role"],
      passwordHash: str(r.password_hash),
    }
  }

  async findById(id: number): Promise<Admin | null> {
    const rows = await query<Row>(
      this.pool,
      "SELECT id, nom, email, role FROM administrateur WHERE id = ?",
      [id],
    )
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), email: str(r.email), role: r.role as Admin["role"] }
  }
}

class MysqlVehiculeRepo implements VehiculeRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Vehicule[]> {
    let sql = "SELECT * FROM vehicule"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE immatriculation LIKE ? OR marque_modele LIKE ? OR categorie LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like, like)
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map(mapVehicule)
  }

  async get(id: number): Promise<Vehicule | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM vehicule WHERE id = ?", [id])
    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async findByImmatriculation(immat: string): Promise<Vehicule | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM vehicule WHERE immatriculation = ?", [
      immat.trim(),
    ])
    return rows[0] ? mapVehicule(rows[0]) : null
  }

  async create(input: VehiculeInput): Promise<Vehicule> {
    const [result] = await this.pool.query(
      "INSERT INTO vehicule (immatriculation, marque_modele, categorie, kilometrage, statut) VALUES (?, ?, ?, ?, ?)",
      [input.immatriculation, input.marqueModele, input.categorie, input.kilometrage, input.statut],
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
      params.push(input.immatriculation)
    }
    if (input.marqueModele !== undefined) {
      sets.push("marque_modele = ?")
      params.push(input.marqueModele)
    }
    if (input.categorie !== undefined) {
      sets.push("categorie = ?")
      params.push(input.categorie)
    }
    if (input.kilometrage !== undefined) {
      sets.push("kilometrage = ?")
      params.push(input.kilometrage)
    }
    if (input.statut !== undefined) {
      sets.push("statut = ?")
      params.push(input.statut)
    }
    if (sets.length === 0) return this.get(id)
    await this.pool.query(`UPDATE vehicule SET ${sets.join(", ")} WHERE id = ?`, [...params, id])
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM vehicule WHERE id = ?", [id])
    return (result as { affectedRows: number }).affectedRows > 0
  }
}

class MysqlClientRepo implements ClientRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Client[]> {
    let sql = "SELECT id, nom, type, telephone FROM client"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE nom LIKE ? OR telephone LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({
      id: num(r.id),
      nom: str(r.nom),
      type: r.type as Client["type"],
      telephone: str(r.telephone),
    }))
  }

  async get(id: number): Promise<Client | null> {
    const rows = await query<Row>(this.pool, "SELECT id, nom, type, telephone FROM client WHERE id = ?", [id])
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), type: r.type as Client["type"], telephone: str(r.telephone) }
  }

  async fiches(): Promise<ClientFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id, c.nom, c.type, c.telephone,
              COUNT(l.id) AS locations_count,
              MAX(l.date_fin) AS derniere
         FROM client c
         LEFT JOIN location l ON l.client_id = c.id
        GROUP BY c.id
        ORDER BY c.id`,
    )
    return rows.map((r) => ({
      id: num(r.id),
      nom: str(r.nom),
      type: r.type as Client["type"],
      telephone: str(r.telephone),
      locationsCount: num(r.locations_count),
      derniereOperation: r.derniere ? str(r.derniere).slice(0, 10).split("-").reverse().join("/") : null,
    }))
  }
}

class MysqlCommercialRepo implements CommercialRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Commercial[]> {
    let sql = "SELECT id, nom, contact FROM commercial"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE nom LIKE ? OR contact LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({ id: num(r.id), nom: str(r.nom), contact: str(r.contact) }))
  }

  async get(id: number): Promise<Commercial | null> {
    const rows = await query<Row>(this.pool, "SELECT id, nom, contact FROM commercial WHERE id = ?", [id])
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), contact: str(r.contact) }
  }

  async fiches(): Promise<CommercialFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id, c.nom, c.contact,
              COUNT(l.id) AS conclues,
              COALESCE(SUM(l.montant), 0) AS ca
         FROM commercial c
         LEFT JOIN location l ON l.commercial_id = c.id AND l.statut <> 'Annulé'
        GROUP BY c.id
        ORDER BY c.id`,
    )
    return rows.map((r) => {
      const conclues = num(r.conclues)
      return {
        id: num(r.id),
        nom: str(r.nom),
        contact: str(r.contact),
        locationsConclues: conclues,
        chiffreAffaires: num(r.ca),
        performance: performanceOf(conclues),
      }
    })
  }
}

class MysqlLocationRepo implements LocationRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Location[]> {
    let sql = "SELECT * FROM location"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE reference LIKE ? OR statut LIKE ?"
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
    let sql = `SELECT l.*, c.nom AS client_nom, v.marque_modele AS vehicule_nom
                 FROM location l
                 JOIN client c ON c.id = l.client_id
                 JOIN vehicule v ON v.id = l.vehicule_id
                ORDER BY l.id`
    const params: unknown[] = []
    if (limit) {
      sql += " LIMIT ?"
      params.push(limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({ ...mapLocation(r), client: str(r.client_nom), vehicule: str(r.vehicule_nom) }))
  }

  async get(id: number): Promise<Location | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM location WHERE id = ?", [id])
    return rows[0] ? mapLocation(rows[0]) : null
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT l.*, c.nom AS client_nom, v.marque_modele AS vehicule_nom
         FROM location l
         JOIN client c ON c.id = l.client_id
         JOIN vehicule v ON v.id = l.vehicule_id
        WHERE l.client_id = ?
        ORDER BY l.date_fin DESC`,
      [clientId],
    )
    return rows.map((r) => ({ ...mapLocation(r), client: str(r.client_nom), vehicule: str(r.vehicule_nom) }))
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT * FROM location
        WHERE vehicule_id = ?
          AND statut IN ('En cours', 'À retourner')
          AND date_debut <= ? AND ? <= date_fin`,
      [vehiculeId, fin, debut],
    )
    return rows.map(mapLocation)
  }
}

class MysqlReservationRepo implements ReservationRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Reservation[]> {
    let sql = "SELECT * FROM reservation"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE reference LIKE ? OR statut LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY id"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    return (await query<Row>(this.pool, sql, params)).map(mapReservation)
  }

  async fiches(): Promise<ReservationFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT r.*, c.nom AS client_nom, co.nom AS commercial_nom
         FROM reservation r
         JOIN client c ON c.id = r.client_id
         LEFT JOIN commercial co ON co.id = r.commercial_id
        ORDER BY r.id`,
    )
    return rows.map((r) => ({
      ...mapReservation(r),
      client: str(r.client_nom),
      commercial: strNull(r.commercial_nom),
    }))
  }

  async get(id: number): Promise<Reservation | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM reservation WHERE id = ?", [id])
    return rows[0] ? mapReservation(rows[0]) : null
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]> {
    const rows = await query<Row>(
      this.pool,
      "SELECT * FROM reservation WHERE vehicule_id = ? AND statut IN ('En attente', 'Confirmée')",
      [vehiculeId],
    )
    return rows
      .map(mapReservation)
      .filter((r) => overlaps(r.dateDepart, addDays(r.dateDepart, r.dureeJours), debut, fin))
  }
}

class MysqlMaintenanceRepo implements MaintenanceRepo {
  constructor(private pool: mysql.Pool) {}

  async list(options?: ListOptions): Promise<Maintenance[]> {
    let sql = "SELECT * FROM maintenance"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE motif LIKE ? OR statut LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY date_entree DESC"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({
      id: num(r.id),
      vehiculeId: num(r.vehicule_id),
      dateEntree: str(r.date_entree).slice(0, 10),
      dateSortie: r.date_sortie ? str(r.date_sortie).slice(0, 10) : null,
      motif: str(r.motif),
      cout: num(r.cout),
      remplacementId: numNull(r.remplacement_id),
      statut: r.statut as Maintenance["statut"],
    }))
  }

  async get(id: number): Promise<Maintenance | null> {
    const rows = await query<Row>(this.pool, "SELECT * FROM maintenance WHERE id = ?", [id])
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
      statut: r.statut as Maintenance["statut"],
    }
  }

  async openForVehicule(vehiculeId: number): Promise<Maintenance | null> {
    const rows = await query<Row>(
      this.pool,
      "SELECT * FROM maintenance WHERE vehicule_id = ? AND statut = 'En cours' LIMIT 1",
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
      statut: r.statut as Maintenance["statut"],
    }
  }
}

class MysqlMouvementRepo implements MouvementRepo {
  constructor(private pool: mysql.Pool) {}

  async list(vehiculeId?: number): Promise<Mouvement[]> {
    let sql = "SELECT * FROM mouvement"
    const params: unknown[] = []
    if (vehiculeId !== undefined) {
      sql += " WHERE vehicule_id = ?"
      params.push(vehiculeId)
    }
    sql += " ORDER BY date_mouvement DESC"
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({
      id: num(r.id),
      vehiculeId: num(r.vehicule_id),
      type: r.type as Mouvement["type"],
      date: str(r.date_mouvement).slice(0, 10),
      commentaire: strNull(r.commentaire),
    }))
  }
}

class MysqlStatsRepo implements StatsRepo {
  constructor(private pool: mysql.Pool) {}

  async overview(): Promise<OverviewStats> {
    const [[ca]] = (await this.pool.query(
      "SELECT COALESCE(SUM(montant), 0) AS total FROM location WHERE statut <> 'Annulé'",
    )) as unknown as Row[][]
    const [[dispo]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule WHERE statut = 'Disponible'",
    )) as unknown as Row[][]
    const [[total]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule",
    )) as unknown as Row[][]
    const [[actives]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM location WHERE statut IN ('En cours', 'À retourner')",
    )) as unknown as Row[][]
    const [[attente]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation WHERE statut = 'En attente'",
    )) as unknown as Row[][]
    const [[locCount]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM location WHERE statut <> 'Annulé'",
    )) as unknown as Row[][]
    const [[abouties]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM reservation WHERE statut = 'Aboutie'",
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
    return MONTHLY_REFERENCE
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
