import type mysql from "mysql2/promise"
import type {
  Admin,
  AdminRecord,
  AdminRepo,
  CategorieVehicule,
  CategorieVehiculeInput,
  CategorieVehiculeRepo,
  Centre,
  CentreRepo,
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
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialRepo,
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
  VenteVehicule,
  VenteVehiculeInput,
  VenteVehiculeRepo,
} from "../types.js"
import { addDays, overlaps, performanceOf } from "../helpers.js"

type Row = Record<string, unknown>

const num = (v: unknown): number => Number(v ?? 0)
const str = (v: unknown): string => String(v ?? "")
const strNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const numNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)
const MOVEMENT_MOTIFS = new Set([
  "LOCATION",
  "COURSE",
  "TRANSFERT",
  "LAVAGE",
  "CARBURANT",
  "MISE_A_DISPOSITION",
  "PRESENTATION_CLIENT",
  "REORGANISATION_PARKING",
  "IMPRO",
  "GARAGE",
  "REVISION",
  "VISITE_TECHNIQUE",
  "AUTRE",
])
const movementMotif = (value: unknown): string | null => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  return MOVEMENT_MOTIFS.has(normalized) ? normalized : null
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
      dateMiseEnService: r.date_mise_en_service ? str(r.date_mise_en_service).slice(0, 10) : null,
      dateEntreeParc: r.date_entree_parc ? str(r.date_entree_parc).slice(0, 10) : null,
      prixAchat: numNull(r.prix_achat),
      dateAchat: r.date_achat ? str(r.date_achat).slice(0, 10) : null,
    dateProchaineVisiteTechnique: r.date_prochaine_visite_technique ? str(r.date_prochaine_visite_technique).slice(0, 10) : null,
    dateExpirationAssurance: r.date_expiration_assurance ? str(r.date_expiration_assurance).slice(0, 10) : null,
    observation: strNull(r.observation),
    categorieId: numNull(r.categorie_id),
    statut: r.statut as Vehicule["statut"],
  }
}

function mapLocation(r: Row): Location {
  return {
    id: num(r.id ?? r.id_location),
    reference: str(r.reference ?? r.numero_contrat),
    clientId: num(r.client_id ?? r.id_client),
    vehiculeId: num(r.vehicule_id ?? r.id_vehicule),
    commercialId: numNull(r.commercial_id ?? r.id_commercial),
    type: (r.type ?? (r.type_location === "LONGUE_DUREE" ? "Longue durée" : "Courte durée")) as Location["type"],
    dateDebut: locationDateTime(r.date_debut ?? r.date_debut_prevue),
    dateFin: locationDateTime(r.date_fin ?? r.date_fin_prevue),
    dateRetourReelle: r.date_retour_reelle ? locationDateTime(r.date_retour_reelle) : null,
    montant: num(r.montant ?? r.montant_total),
    statut: r.statut as Location["statut"],
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

function mapProlongation(r: Row): Prolongation {
  return {
    id: num(r.id_prolongation),
    locationId: num(r.id_location),
    ancienneDateFin: r.ancienne_date_fin ? locationDateTime(r.ancienne_date_fin) : null,
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
    dateVente: str(r.date_vente).slice(0, 10),
    prixVente: num(r.prix_vente),
    devise: str(r.devise),
    fraisVente: num(r.frais_vente),
    motifVente: r.motif_vente as VenteVehicule["motifVente"],
    etatVehicule: r.etat_vehicule as VenteVehicule["etatVehicule"],
    kilometrageVente: num(r.kilometrage_vente),
    canalVente: r.canal_vente as VenteVehicule["canalVente"],
    statutPaiement: r.statut_paiement as VenteVehicule["statutPaiement"],
    dateRemiseVehicule: r.date_remise_vehicule ? str(r.date_remise_vehicule).slice(0, 10) : null,
    referenceCession: strNull(r.reference_cession),
    statut: r.statut as VenteVehicule["statut"],
    dateAnnulation: r.date_annulation ? str(r.date_annulation).slice(0, 10) : null,
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
    clientId: num(r.client_id ?? r.id_client),
    vehiculeId: numNull(r.vehicule_id ?? r.id_vehicule),
    commercialId: numNull(r.commercial_id ?? r.id_commercial),
    dateDepart: str(r.date_depart ?? r.date_debut_prevue).slice(0, 10),
    dureeJours: num(r.duree_jours),
    statut: ({
      EN_ATTENTE: "En attente",
      CONFIRMEE: "Confirmée",
      TRANSFORMEE_EN_LOCATION: "Aboutie",
      ANNULEE: "Annulée",
      "En attente": "En attente",
      "Confirmée": "Confirmée",
      Aboutie: "Aboutie",
      "Non aboutie": "Non aboutie",
      Annulée: "Annulée",
    }[statut] ?? "Non aboutie") as Reservation["statut"],
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
    const rows = await query<Row>(
      this.pool,
      `SELECT id_administrateur AS id, CONCAT_WS(' ', prenom, nom) AS nom,
              email, mot_de_passe_hash AS password_hash
         FROM administrateur
        WHERE email = ? AND actif = TRUE`,
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
      `SELECT id_administrateur AS id, CONCAT_WS(' ', prenom, nom) AS nom, email
         FROM administrateur
        WHERE id_administrateur = ? AND actif = TRUE`,
      [id],
    )
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), email: str(r.email), role: "responsable" }
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
      params.push(`%${options.q.trim()}%`, `%${options.q.trim()}%`, `%${options.q.trim()}%`)
    }
    sql += " ORDER BY nom"
    return query<Row>(this.pool, sql, params).then((rows) =>
      rows.map((row) => ({ id: num(row.id), nom: str(row.nom), adresse: strNull(row.adresse), telephone: strNull(row.telephone) })),
    )
  }

  async get(id: number): Promise<Garage | null> {
    const rows = await query<Row>(this.pool, "SELECT id_garage AS id, nom, adresse, telephone FROM garage WHERE id_garage = ?", [id])
    const row = rows[0]
    return row ? { id: num(row.id), nom: str(row.nom), adresse: strNull(row.adresse), telephone: strNull(row.telephone) } : null
  }

  async create(input: GarageInput): Promise<Garage> {
    const [result] = await this.pool.query(
      "INSERT INTO garage (nom, adresse, telephone) VALUES (?, ?, ?)",
      [input.nom, input.adresse ?? null, input.telephone ?? null],
    )
    return (await this.get(Number((result as mysql.ResultSetHeader).insertId)))!
  }

  async update(id: number, input: Partial<GarageInput>): Promise<Garage | null> {
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
    if (sets.length) await this.pool.query(`UPDATE garage SET ${sets.join(", ")} WHERE id_garage = ?`, [...params, id])
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM garage WHERE id_garage = ?", [id])
    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }
}

function mapPassageGarage(r: Row): PassageGarage {
  return {
    id: num(r.id),
    typePassage: r.type_passage as PassageGarage["typePassage"],
    dateEntree: str(r.date_entree).slice(0, 10),
    dateSortiePrevue: r.date_sortie_prevue ? str(r.date_sortie_prevue).slice(0, 10) : null,
    dateSortieReelle: r.date_sortie_reelle ? str(r.date_sortie_reelle).slice(0, 10) : null,
    kmEntree: numNull(r.km_entree),
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
                      JOIN vehicule v ON v.id_vehicule = p.id_vehicule`

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
    const rows = await query<Row>(this.pool, `${this.select} WHERE r.id_reparation = ?`, [id])
    return rows[0] ? mapReparation(rows[0]) : null
  }

  async update(id: number, input: Partial<ReparationInput>): Promise<Reparation | null> {
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
      await this.pool.query(`UPDATE reparation SET ${sets.join(", ")} WHERE id_reparation = ?`, [...params, id])
    }
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM reparation WHERE id_reparation = ?", [id])
    return Number((result as mysql.ResultSetHeader).affectedRows) > 0
  }
}

class MysqlPassageGarageRepo implements PassageGarageRepo {
  constructor(private pool: mysql.Pool) {}

  private select = `SELECT p.id_passage AS id, p.type_passage, p.date_entree,
                           p.date_sortie_prevue, p.date_sortie_reelle, p.km_entree,
                           p.motif, p.statut, p.cout_total,
                           p.id_vehicule AS vehicule_id, p.id_garage AS garage_id,
                           v.immatriculation AS vehicule, g.nom AS garage,
                           p.id_vehicule_remplacement AS vehicule_remplacement_id
                      FROM passage_garage p
                      JOIN vehicule v ON v.id_vehicule = p.id_vehicule
                      JOIN garage g ON g.id_garage = p.id_garage`

  async list(options?: ListOptions): Promise<PassageGarage[]> {
    let sql = this.select
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE v.immatriculation LIKE ? OR g.nom LIKE ? OR p.type_passage LIKE ? OR p.statut LIKE ? OR p.motif LIKE ?"
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
    const rows = await query<Row>(this.pool, `${this.select} WHERE p.id_passage = ?`, [id])
    return rows[0] ? mapPassageGarage(rows[0]) : null
  }

  async update(id: number, input: Partial<PassageGarageInput>): Promise<PassageGarage | null> {
    const connection = await this.pool.getConnection()
    try {
    await connection.beginTransaction()
    const [currentRows] = (await connection.query(
      "SELECT id_vehicule, statut, motif, km_entree FROM passage_garage WHERE id_passage = ? FOR UPDATE",
      [id],
    )) as unknown as [Row[], unknown]
    const current = currentRows[0]
    if (!current) {
      await connection.rollback()
      return null
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
        params.push(
          key === "dateSortieReelle" && input.statut === "TERMINEE"
            ? today()
            : input[key] ?? null,
        )
      }
    }
    if (sets.length) {
      await connection.query(`UPDATE passage_garage SET ${sets.join(", ")} WHERE id_passage = ?`, [...params, id])
    }
    if (input.statut === "TERMINEE") {
      const dateSortie = today()
      await connection.query(
        "UPDATE passage_garage SET date_sortie_reelle = ? WHERE id_passage = ?",
        [dateSortie, id],
      )
      if (current.statut !== "TERMINEE") {
        await connection.query(
          `INSERT INTO mouvement_vehicule
           (type_mouvement, motif, date_mouvement, kilometrage, observation, id_vehicule, id_passage)
           VALUES ('RETOUR_GARAGE', ?, ?, ?, 'Retour du garage', ?, ?)`,
          [
            movementMotif(input.motif ?? current.motif),
            `${dateSortie} 00:00:00`,
            input.kmEntree ?? current.km_entree ?? null,
            current.id_vehicule,
            id,
          ],
        )
        await connection.query(
          "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, COALESCE(?, 0)) WHERE id_vehicule = ?",
          ["RETOUR_GARAGE", input.kmEntree ?? current.km_entree ?? null, current.id_vehicule],
        )
        const [repairRows] = (await connection.query(
          "SELECT id_reparation FROM reparation WHERE id_passage = ? LIMIT 1",
          [id],
        )) as unknown as [Row[], unknown]
        if (!repairRows[0]) {
          await connection.query(
            `INSERT INTO reparation (description, date_reparation, cout, id_passage)
             VALUES (?, ?, ?, ?)`,
            [
              input.motif ?? current.motif ?? "Réparation effectuée au garage",
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
    const rows = await query<Row>(this.pool, `${this.select} WHERE m.id_modele = ?`, [id])
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

  async update(id: number, input: Partial<ModeleVehiculeInput>): Promise<ModeleVehicule | null> {
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
      await this.pool.query(`UPDATE modele_vehicule SET ${sets.join(", ")} WHERE id_modele = ?`, params)
    }
    return this.get(id)
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM modele_vehicule WHERE id_modele = ?", [id])
    return (result as mysql.ResultSetHeader).affectedRows > 0
  }
}

class MysqlCentreRepo implements CentreRepo {
  constructor(private pool: mysql.Pool) {}
  async list(): Promise<Centre[]> {
    const rows = await query<Row>(this.pool, "SELECT id_centre AS id, nom FROM centre ORDER BY nom")
    return rows.map((r) => ({ id: num(r.id), nom: str(r.nom) }))
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
      sql += " WHERE v.immatriculation LIKE ? OR v.marque LIKE ? OR v.modele LIKE ?"
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
        input.immatriculation, input.marque, input.modele, input.version ?? null, input.annee ?? null,
        input.numeroChassis ?? null, input.couleur ?? null, input.carburant ?? null, input.nbPlaces ?? null,
        input.kilometrage, input.segmentParc, input.groupeGeolocalisation ?? null, input.centreId ?? null,
        input.dateMiseEnService ?? null, input.dateEntreeParc ?? null, input.prixAchat ?? null, input.dateAchat ?? null, input.dateProchaineVisiteTechnique ?? null,
        input.dateExpirationAssurance ?? null, input.observation ?? null, input.categorieId, adminId,
      ],
    )
    const id = (result as mysql.ResultSetHeader).insertId
    const created = await this.get(id)
    if (!created) throw new Error("Véhicule créé introuvable")
    return created
  }

  async update(id: number, input: Partial<VehiculeInput>): Promise<Vehicule | null> {
    const sets: string[] = []
    const params: unknown[] = []
    const fields: Array<[keyof VehiculeInput, string]> = [
      ["immatriculation", "immatriculation"], ["marque", "marque"], ["modele", "modele"],
      ["version", "version"], ["annee", "annee"], ["numeroChassis", "numero_chassis"],
      ["couleur", "couleur"], ["carburant", "carburant"], ["nbPlaces", "nb_places"],
      ["kilometrage", "kilometrage"], ["segmentParc", "segment_parc"],
      ["groupeGeolocalisation", "groupe_geolocalisation"], ["centreId", "id_centre"],
      ["dateMiseEnService", "date_mise_en_service"], ["dateEntreeParc", "date_entree_parc"],
      ["prixAchat", "prix_achat"], ["dateAchat", "date_achat"],
      ["dateProchaineVisiteTechnique", "date_prochaine_visite_technique"],
      ["dateExpirationAssurance", "date_expiration_assurance"], ["observation", "observation"],
      ["categorieId", "id_categorie"],
    ]
    for (const [key, column] of fields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`)
        params.push(input[key] ?? null)
      }
    }
    if (sets.length === 0) return this.get(id)
    await this.pool.query(`UPDATE vehicule SET ${sets.join(", ")} WHERE id_vehicule = ?`, [...params, id])
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
    let sql = "SELECT id_client AS id, nom, type_client AS type, telephone FROM client"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE nom LIKE ? OR telephone LIKE ?"
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
      type: r.type as Client["type"],
      telephone: str(r.telephone),
    }))
  }

  async get(id: number): Promise<Client | null> {
    const rows = await query<Row>(this.pool, "SELECT id_client AS id, nom, type_client AS type, telephone FROM client WHERE id_client = ?", [id])
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), type: r.type as Client["type"], telephone: str(r.telephone) }
  }

  async fiches(): Promise<ClientFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id_client AS id, c.nom, c.type_client AS type, c.telephone,
              COUNT(l.id_location) AS locations_count,
              MAX(l.date_fin_prevue) AS derniere
         FROM client c
         LEFT JOIN location l ON l.id_client = c.id_client
        GROUP BY c.id_client, c.nom, c.type_client, c.telephone
        ORDER BY c.id_client`,
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
    let sql = "SELECT id_commercial AS id, CONCAT(nom, COALESCE(CONCAT(' ', prenom), '')) AS nom, telephone AS contact FROM commercial"
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE nom LIKE ? OR contact LIKE ?"
      const like = `%${options.q.trim()}%`
      params.push(like, like)
    }
    sql += " ORDER BY id_commercial"
    if (options?.limit) {
      sql += " LIMIT ?"
      params.push(options.limit)
    }
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({ id: num(r.id), nom: str(r.nom), contact: str(r.contact) }))
  }

  async get(id: number): Promise<Commercial | null> {
    const rows = await query<Row>(this.pool, "SELECT id_commercial AS id, CONCAT(nom, COALESCE(CONCAT(' ', prenom), '')) AS nom, telephone AS contact FROM commercial WHERE id_commercial = ?", [id])
    const r = rows[0]
    if (!r) return null
    return { id: num(r.id), nom: str(r.nom), contact: str(r.contact) }
  }

  async fiches(): Promise<CommercialFiche[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT c.id_commercial AS id,
              CONCAT(c.nom, COALESCE(CONCAT(' ', c.prenom), '')) AS nom,
              c.telephone AS contact,
              COUNT(l.id_location) AS conclues,
              COALESCE(SUM(l.montant_total), 0) AS ca
         FROM commercial c
         LEFT JOIN location l ON l.id_commercial = c.id_commercial AND l.statut <> 'ANNULEE'
        GROUP BY c.id_commercial, c.nom, c.prenom, c.telephone
        ORDER BY c.id_commercial`,
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

class MysqlProlongationRepo implements ProlongationRepo {
  constructor(private pool: mysql.Pool) {}
  async list(): Promise<Prolongation[]> {
    await refreshRentalStatuses(this.pool)
    return (await query<Row>(this.pool, "SELECT * FROM prolongation_location ORDER BY date_demande DESC", [])).map(mapProlongation)
  }
  async get(id: number): Promise<Prolongation | null> {
    await refreshRentalStatuses(this.pool)
    const rows = await query<Row>(this.pool, "SELECT * FROM prolongation_location WHERE id_prolongation = ?", [id])
    return rows[0] ? mapProlongation(rows[0]) : null
  }
  async create(input: ProlongationInput): Promise<Prolongation> {
    const [result] = await this.pool.query(
      `INSERT INTO prolongation_location
        (id_location, ancienne_date_fin, nouvelle_date_fin, date_demande, motif, montant_supplementaire, id_commercial)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.locationId, input.ancienneDateFin ?? null, input.nouvelleDateFin, input.dateDemande, input.motif ?? null, input.montantSupplementaire, input.commercialId ?? null],
    )
    const row = await this.get(Number((result as mysql.ResultSetHeader).insertId))
    if (!row) throw new Error("Prolongation créée mais introuvable")
    return row
  }
  async update(id: number, input: Partial<ProlongationInput>): Promise<Prolongation | null> {
    const current = await this.get(id)
    if (!current) return null
    const next = { ...current, ...input }
    await this.pool.query(
      `UPDATE prolongation_location SET id_location = ?, ancienne_date_fin = ?, nouvelle_date_fin = ?,
        statut = CASE WHEN ? >= ? THEN 'EN_COURS' ELSE 'EXPIRE' END,
        date_demande = ?, motif = ?, montant_supplementaire = ?, id_commercial = ?
       WHERE id_prolongation = ?`,
      [next.locationId, next.ancienneDateFin, next.nouvelleDateFin, sqlDateTime(next.nouvelleDateFin), localSqlDateTimeNow(), next.dateDemande, next.motif, next.montantSupplementaire, next.commercialId, id],
    )
    return this.get(id)
  }
  async remove(id: number): Promise<boolean> {
    const [result] = await this.pool.query("DELETE FROM prolongation_location WHERE id_prolongation = ?", [id])
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
                      date_fin_prevue, date_retour_reelle, montant_total, statut
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
                      c.nom AS client_nom, CONCAT(v.marque, ' ', v.modele) AS vehicule_nom
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
    await this.refreshStatuses()
    const rows = await query<Row>(this.pool, "SELECT id_location AS id, numero_contrat AS reference, id_client AS client_id, id_vehicule AS vehicule_id, id_commercial AS commercial_id, type_location, date_debut, date_fin_prevue, date_retour_reelle, montant_total, statut FROM location WHERE id_location = ?", [id])
    return rows[0] ? mapLocation(rows[0]) : null
  }

  async create(input: LocationInput): Promise<Location> {
    const dateDebut = sqlDateTime(input.dateDebut)
    const dateFin = sqlDateTime(input.dateFin)
    const connection = await this.pool.getConnection()
    let id = 0
    try {
      await connection.beginTransaction()
      const [result] = await connection.query(
        `INSERT INTO location
        (numero_contrat, type_location, date_debut, date_fin_prevue, km_depart,
         montant_total, statut, date_retour_reelle, id_client, id_vehicule, id_commercial, id_administrateur)
       SELECT ?, ?, ?, ?, v.kilometrage, ?,
              CASE WHEN ? = 'EN_COURS' AND ? < ? THEN 'EN_RETARD' ELSE ? END,
              CASE WHEN ? = 'TERMINEE' THEN ? ELSE NULL END,
              ?, ?, COALESCE(?, (SELECT id_commercial FROM commercial ORDER BY id_commercial LIMIT 1)), a.id_administrateur
         FROM vehicule v
         JOIN client c ON c.id_client = ?
         JOIN administrateur a ON a.id_administrateur = (SELECT id_administrateur FROM administrateur ORDER BY id_administrateur LIMIT 1)
        WHERE v.id_vehicule = ?
        LIMIT 1`,
        [
          input.reference?.trim() || `LOC-${String(Date.now()).slice(-5)}`,
          input.type === "Longue durée" ? "LONGUE_DUREE" : "COURTE_DUREE",
          dateDebut,
          dateFin,
          input.montant ?? 0,
          input.statut ?? "EN_COURS",
          dateFin,
          localSqlDateTimeNow(),
          input.statut ?? "EN_COURS",
          input.statut ?? "EN_COURS",
          localSqlDateTimeNow(),
          input.clientId,
          input.vehiculeId,
          input.commercialId ?? null,
          input.clientId,
          input.vehiculeId,
        ],
      )
      id = Number((result as mysql.ResultSetHeader).insertId)
      if (id === 0) throw new Error("Location non créée")
      const movementType = input.statut === "TERMINEE" ? "RETOUR_LOCATION" : "MISE_EN_LOCATION"
      const movementDate = localSqlDateTimeNow()
      await connection.query(
        `INSERT INTO mouvement_vehicule
          (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule, id_location)
         SELECT ?, ?, v.kilometrage, ?, v.id_vehicule, ? FROM vehicule v WHERE v.id_vehicule = ?`,
        [movementType, movementDate, input.reference?.trim() || "Location", id, input.vehiculeId],
      )
      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, (SELECT km_depart FROM location WHERE id_location = ?)) WHERE id_vehicule = ?",
        [movementType, id, input.vehiculeId],
      )
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

  async update(id: number, input: Partial<LocationInput>): Promise<Location | null> {
    const current = await this.get(id)
    if (!current) return null
    const next = { ...current, ...input }
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `UPDATE location SET numero_contrat = ?, type_location = ?, date_debut = ?,
        date_fin_prevue = ?, montant_total = ?,
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
          sqlDateTime(next.dateFin),
          next.montant,
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
        await connection.query(
          `INSERT INTO prolongation_location
            (id_location, ancienne_date_fin, nouvelle_date_fin, date_demande, motif, montant_supplementaire, id_commercial)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, sqlDateTime(p.ancienneDateFin ?? current.dateFin), sqlDateTime(p.nouvelleDateFin), sqlDateTime(p.dateDemande), p.motif ?? null, p.montantSupplementaire, p.commercialId ?? next.commercialId],
        )
        await connection.query(
          "UPDATE location SET date_fin_prevue = ?, montant_total = montant_total + ?, statut = 'EN_PROLONGATION' WHERE id_location = ?",
          [sqlDateTime(p.nouvelleDateFin), p.montantSupplementaire, id],
        )
      }
      const wasCompleted = current.statut === "TERMINEE"
      const isCompleted = next.statut === "TERMINEE"
      if (wasCompleted !== isCompleted) {
        const movementType = isCompleted ? "RETOUR_LOCATION" : "MISE_EN_LOCATION"
        const movementDate = localSqlDateTimeNow()
        await connection.query(
          `INSERT INTO mouvement_vehicule
            (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule, id_location)
           SELECT ?, ?, v.kilometrage, ?, v.id_vehicule, ? FROM vehicule v WHERE v.id_vehicule = ?`,
          [movementType, movementDate, next.reference, id, next.vehiculeId],
        )
      }
      if (next.statut === "TERMINEE") {
        await connection.query("UPDATE vehicule SET statut = 'RETOUR_LOCATION' WHERE id_vehicule = ?", [next.vehiculeId])
      } else if (current.statut === "TERMINEE") {
        await connection.query("UPDATE vehicule SET statut = 'MISE_EN_LOCATION' WHERE id_vehicule = ?", [next.vehiculeId])
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
          [localSqlDateTimeNow(), `Clôture de ${location.numero_contrat ?? `location #${id}`}`, location.id_vehicule, id],
        )
      }
      const [result] = await connection.query("DELETE FROM location WHERE id_location = ?", [id])
      const [latestRows] = (await connection.query(
        `SELECT type_mouvement AS type, kilometrage FROM mouvement_vehicule
          WHERE id_vehicule = ? ORDER BY date_mouvement DESC, id_mouvement DESC LIMIT 1`,
        [location.id_vehicule],
      )) as unknown as [Row[], unknown]
      const latest = latestRows[0]
      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = COALESCE(?, kilometrage) WHERE id_vehicule = ?",
        [latest?.type ?? "ENTREE_PARC", latest?.kilometrage ?? null, location.id_vehicule],
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
      `SELECT l.*, c.nom AS client_nom, v.marque_modele AS vehicule_nom
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
    await this.refreshStatuses()
    const rows = await query<Row>(
      this.pool,
      `SELECT id_location AS id, numero_contrat AS reference, id_client AS client_id,
              id_vehicule AS vehicule_id, id_commercial AS commercial_id,
              type_location, date_debut, date_fin_prevue, montant_total, statut
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

  async list(options?: ListOptions): Promise<Reservation[]> {
    let sql = `SELECT id_reservation, ref_proforma, id_client, id_vehicule, id_commercial,
                      date_debut_prevue, duree_jours, statut
                 FROM reservation`
    const params: unknown[] = []
    if (options?.q) {
      sql += " WHERE COALESCE(ref_proforma, CAST(id_reservation AS CHAR)) LIKE ? OR statut LIKE ?"
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
    const rows = await query<Row>(
      this.pool,
      `SELECT r.*, c.nom AS client_nom, co.nom AS commercial_nom
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
    const rows = await query<Row>(this.pool, "SELECT * FROM reservation WHERE id_reservation = ?", [id])
    return rows[0] ? mapReservation(rows[0]) : null
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]> {
    const rows = await query<Row>(
      this.pool,
      `SELECT id_reservation, ref_proforma, id_client, id_vehicule, id_commercial,
              date_debut_prevue, duree_jours, statut
         FROM reservation
        WHERE id_vehicule = ?
          AND statut IN ('EN_ATTENTE', 'CONFIRMEE')
          AND date_debut_prevue IS NOT NULL
          AND date_fin_prevue IS NOT NULL
          AND date_debut_prevue <= ?
          AND date_fin_prevue >= ?`,
      [vehiculeId, fin, debut],
    )
    return rows.map(mapReservation)
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
    let sql = `SELECT id_mouvement AS id, id_vehicule AS vehicule_id,
                      id_location AS location_id, type_mouvement AS type, motif, kilometrage, date_mouvement, observation AS commentaire
                 FROM mouvement_vehicule`
    const params: unknown[] = []
    if (vehiculeId !== undefined) {
      sql += " WHERE id_vehicule = ?"
      params.push(vehiculeId)
    }
    sql += " ORDER BY date_mouvement DESC"
    const rows = await query<Row>(this.pool, sql, params)
    return rows.map((r) => ({
      id: num(r.id),
      vehiculeId: num(r.vehicule_id),
      locationId: numNull(r.location_id),
      type: r.type as Mouvement["type"],
      motif: strNull(r.motif),
      kilometrage: numNull(r.kilometrage),
      date: str(r.date_mouvement).slice(0, 10),
      commentaire: strNull(r.commentaire),
    }))
  }

  async createEntry(input: { vehiculeId: number; date: string; kilometrage: number; observation?: string | null }): Promise<void> {
    await this.pool.query(
      `INSERT INTO mouvement_vehicule
        (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule)
       VALUES ('ENTREE_PARC', ?, ?, ?, ?)`,
      [`${input.date} 00:00:00`, input.kilometrage, input.observation ?? null, input.vehiculeId],
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
    dateDebut?: string
    dateFin?: string
  }): Promise<Mouvement> {
    const connection = await this.pool.getConnection()
    const date = new Date()
    try {
      await connection.beginTransaction()
      const [result] = await connection.query(
        `INSERT INTO mouvement_vehicule
          (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule)
         VALUES (?, ?, ?, ?, ?)`,
        [input.statut, date, input.kilometrage, input.observation ?? null, input.vehiculeId],
      )
      const insertId = Number((result as { insertId?: number }).insertId ?? 0)
      let locationId: number | null = null
      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = GREATEST(kilometrage, ?) WHERE id_vehicule = ?",
        [input.statut, input.kilometrage, input.vehiculeId],
      )
      if (input.statut === "ENVOI_GARAGE") {
        const [garages] = (await connection.query(
          "SELECT id_garage FROM garage WHERE (? IS NULL OR id_garage = ?) ORDER BY id_garage LIMIT 1",
          [input.garageId ?? null, input.garageId ?? null],
        )) as unknown as [Row[], unknown]
        const garage = garages[0]
        if (!garage) throw new Error("Aucun garage disponible pour enregistrer le passage")
        const [passageResult] = await connection.query(
          `INSERT INTO passage_garage
           (type_passage, date_entree, km_entree, motif, statut, cout_total, id_vehicule, id_garage)
           VALUES (?, ?, ?, ?, 'EN_COURS', 0, ?, ?)`,
          [input.typePassage ?? "REPARATION", date.toISOString().slice(0, 10), input.kilometrage, input.motif ?? input.observation ?? null, input.vehiculeId, garage.id_garage],
        )
        await connection.query(
          `UPDATE mouvement_vehicule
              SET id_passage = ?
            WHERE id_mouvement = ?
              AND type_mouvement = 'ENVOI_GARAGE'`,
          [
            Number((passageResult as mysql.ResultSetHeader).insertId),
            insertId,
          ],
        )
      }
      if (input.statut === "MISE_EN_LOCATION") {
        const [locationResult] = await connection.query(
          `INSERT INTO location
            (numero_contrat, type_location, date_debut, date_fin_prevue, km_depart,
             montant_total, statut, id_client, id_vehicule, id_commercial, id_administrateur)
           SELECT ?, ?, ?, ?, v.kilometrage, 0, 'EN_COURS',
                  ?,
                  v.id_vehicule,
                  ?,
                  (SELECT id_administrateur FROM administrateur ORDER BY id_administrateur LIMIT 1)
             FROM vehicule v
            WHERE v.id_vehicule = ?`,
          [
            `LOC-${String(Date.now()).slice(-5)}`,
            input.typeLocation === "Longue durée" ? "LONGUE_DUREE" : "COURTE_DUREE",
            sqlDateTime(input.dateDebut ?? date.toISOString()),
            sqlDateTime(input.dateFin ?? date.toISOString()),
            input.clientId,
            input.commercialId,
            input.vehiculeId,
          ],
        )
        locationId = Number((locationResult as mysql.ResultSetHeader).insertId)
        await connection.query("UPDATE mouvement_vehicule SET id_location = ? WHERE id_mouvement = ?", [locationId, insertId])
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
            "UPDATE location SET statut = 'TERMINEE', date_retour_reelle = ? WHERE id_location = ?",
            [date, locationId],
          )
          await connection.query("UPDATE mouvement_vehicule SET id_location = ? WHERE id_mouvement = ?", [locationId, insertId])
        }
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
      await connection.query("DELETE FROM mouvement_vehicule WHERE id_mouvement = ?", [id])
      const [latest] = (await connection.query(
        `SELECT type_mouvement AS type, kilometrage
         FROM mouvement_vehicule WHERE id_vehicule = ?
         ORDER BY date_mouvement DESC, id_mouvement DESC LIMIT 1`,
        [current.vehicule_id],
      )) as unknown as [Row[], unknown]
      const next = latest[0]
      await connection.query(
        "UPDATE vehicule SET statut = ?, kilometrage = COALESCE(?, kilometrage) WHERE id_vehicule = ?",
        [next ? next.type : "ENTREE_PARC", next?.kilometrage ?? null, current.vehicule_id],
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
    const rows = await query<Row>(this.pool, "SELECT * FROM vente_vehicule WHERE id_vente = ?", [id])
    return rows[0] ? mapVenteVehicule(rows[0]) : null
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

  async create(input: VenteVehiculeInput, adminId: number): Promise<VenteVehicule> {
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
      if (existingSales.length > 0) throw new Error("Ce véhicule possède déjà une vente conclue")

      const [movementResult] = await connection.query(
        `INSERT INTO mouvement_vehicule
          (type_mouvement, date_mouvement, kilometrage, observation, id_vehicule)
         VALUES ('SORTIE_DEFINITIVE', ?, ?, ?, ?)`,
        [`${input.dateVente} 00:00:00`, input.kilometrageVente, `Vente ${input.numeroVente}`, input.vehiculeId],
      )
      const movementId = Number((movementResult as mysql.ResultSetHeader).insertId)
      const [saleResult] = await connection.query(
        `INSERT INTO vente_vehicule
          (numero_vente, id_vehicule, id_acheteur, date_vente, prix_vente, devise, frais_vente,
           motif_vente, etat_vehicule, kilometrage_vente, canal_vente, statut_paiement,
           date_remise_vehicule, reference_cession, statut, id_facture, id_mouvement,
           id_commercial, id_administrateur, observation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONCLUE', ?, ?, ?, ?, ?)`,
        [
          input.numeroVente, input.vehiculeId, input.acheteurId, input.dateVente, input.prixVente,
          input.devise ?? "XOF", input.fraisVente ?? 0, input.motifVente, input.etatVehicule,
          input.kilometrageVente, input.canalVente ?? null, input.statutPaiement ?? "NON_PAYEE",
          input.dateRemiseVehicule ?? null, input.referenceCession ?? null, input.factureId ?? null,
          movementId, input.commercialId ?? null, adminId, input.observation ?? null,
        ],
      )
      await connection.query(
        `UPDATE vehicule SET statut = 'SORTIE_DEFINITIVE', prix_vente = ?,
          date_sortie_parc = ?, kilometrage = GREATEST(kilometrage, ?)
         WHERE id_vehicule = ?`,
        [input.prixVente, input.dateVente, input.kilometrageVente, input.vehiculeId],
      )
      await connection.commit()
      const sale = await this.get(Number((saleResult as mysql.ResultSetHeader).insertId))
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

class MysqlStatsRepo implements StatsRepo {
  constructor(private pool: mysql.Pool) {}

  async overview(): Promise<OverviewStats> {
    const [[ca]] = (await this.pool.query(
      "SELECT COALESCE(SUM(montant), 0) AS total FROM location WHERE statut <> 'Annulé'",
    )) as unknown as Row[][]
    const [[dispo]] = (await this.pool.query(
      "SELECT COUNT(*) AS n FROM vehicule WHERE statut IN ('ENTREE_PARC', 'RETOUR_LOCATION', 'RETOUR_INTERNE', 'RETOUR_GARAGE')",
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
    categories: new MysqlCategorieRepo(pool),
    modeles: new MysqlModeleRepo(pool),
    centres: new MysqlCentreRepo(pool),
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
    stats: new MysqlStatsRepo(pool),
  }
}
