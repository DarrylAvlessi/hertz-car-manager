import mysql from "mysql2/promise"

import { loadEnv } from "../config/env.js"

async function main(): Promise<void> {
  const env = loadEnv()

  if (env.DB_DRIVER !== "mysql") {
    throw new Error("Cette migration exige DB_DRIVER=mysql dans server/.env.")
  }

  const pool = mysql.createPool({
    host: env.DB_HOST,

    port: env.DB_PORT,

    user: env.DB_USER,

    password: env.DB_PASSWORD,

    database: env.DB_NAME,

    waitForConnections: true,

    connectionLimit: 1,
  })

  const hasColumn = async (table: string, column: string): Promise<boolean> => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,

      [table, column],
    )

    return rows.length > 0
  }

  const isColumnNullable = async (
    table: string,
    column: string,
  ): Promise<boolean> => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [table, column],
    )
    return rows[0]?.IS_NULLABLE === "YES"
  }

  const ensureColumn = async (
    table: string,

    column: string,

    definition: string,
  ): Promise<void> => {
    if (!(await hasColumn(table, column))) {
      await pool.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      )
    }
  }

  const hasIndex = async (table: string, index: string): Promise<boolean> => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT 1
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1`,

      [table, index],
    )

    return rows.length > 0
  }

  const ensureIndex = async (
    table: string,

    index: string,

    definition: string,
  ): Promise<void> => {
    if (!(await hasIndex(table, index))) {
      await pool.query(`ALTER TABLE \`${table}\` ADD ${definition}`)
    }
  }

  const hasConstraint = async (
    table: string,

    constraint: string,
  ): Promise<boolean> => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT 1
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
        LIMIT 1`,

      [table, constraint],
    )

    return rows.length > 0
  }

  const ensureForeignKey = async (
    table: string,

    constraint: string,

    definition: string,
  ): Promise<void> => {
    if (!(await hasConstraint(table, constraint))) {
      await pool.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ${definition}`,
      )
    }
  }

  try {
    const [tables] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN
            ('client', 'commercial', 'administrateur', 'centre',
             'categorie_vehicule', 'modele_vehicule', 'mouvement_vehicule')`,
    )

    if (Number(tables[0]?.total) !== 7) {
      throw new Error(
        `Les tables de référence et mouvement nécessaires sont absentes dans ${env.DB_NAME}.`,
      )
    }

    const ensureCheck = async (
      table: string,

      constraint: string,

      expression: string,
    ): Promise<void> => {
      if (!(await hasConstraint(table, constraint))) {
        await pool.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` CHECK (${expression})`,
        )
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicule_sous_location (
        id_vehicule_sous_location INT AUTO_INCREMENT PRIMARY KEY,
        immatriculation VARCHAR(30) NOT NULL,
        immatriculation_normalisee VARCHAR(30) GENERATED ALWAYS AS
          (UPPER(REPLACE(REPLACE(immatriculation, ' ', ''), '-', ''))) STORED,
        marque VARCHAR(60) NULL,
        modele VARCHAR(80) NULL,
        version VARCHAR(60) NULL,
        annee SMALLINT NULL,
        numero_chassis VARCHAR(40) NULL,
        couleur VARCHAR(30) NULL,
        carburant ENUM('ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE') NULL,
        nb_places TINYINT UNSIGNED NULL,
        kilometrage INT NOT NULL DEFAULT 0,
        segment_parc ENUM('LCD','LLD','LEASING','IMPRO','AUTRE') NOT NULL DEFAULT 'LCD',
        groupe_geolocalisation VARCHAR(80) NULL,
        id_centre INT NULL,
        date_mise_en_service DATE NULL,
        date_entree_parc DATE NULL,
        date_sortie_parc DATE NULL,
        prix_achat DECIMAL(14,2) NULL,
        date_achat DATE NULL,
        prix_vente DECIMAL(14,2) NULL,
        statut ENUM('ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE','RETOUR_INTERNE',
                    'ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION')
          NOT NULL DEFAULT 'ENTREE_PARC',
        date_prochaine_visite_technique DATE NULL,
        date_expiration_assurance DATE NULL,
        observation VARCHAR(255) NULL,
        id_categorie INT NULL,
        id_administrateur INT NOT NULL,
        cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sous_location_vehicule_immat (immatriculation_normalisee),
        CONSTRAINT fk_sous_vehicule_categorie FOREIGN KEY (id_categorie)
          REFERENCES categorie_vehicule(id_categorie),
        CONSTRAINT fk_sous_vehicule_centre FOREIGN KEY (id_centre)
          REFERENCES centre(id_centre) ON DELETE SET NULL,
        CONSTRAINT fk_sous_vehicule_admin FOREIGN KEY (id_administrateur)
          REFERENCES administrateur(id_administrateur),
        INDEX idx_sous_vehicule_statut (statut),
        INDEX idx_sous_vehicule_immat (immatriculation)
      ) ENGINE=InnoDB
    `)

    const vehicleColumns: Array<[string, string]> = [
      [
        "immatriculation_normalisee",

        "VARCHAR(30) GENERATED ALWAYS AS (UPPER(REPLACE(REPLACE(immatriculation, ' ', ''), '-', ''))) STORED",
      ],

      ["marque", "VARCHAR(60) NULL"],

      ["modele", "VARCHAR(80) NULL"],

      ["version", "VARCHAR(60) NULL"],

      ["annee", "SMALLINT NULL"],

      ["numero_chassis", "VARCHAR(40) NULL"],

      ["couleur", "VARCHAR(30) NULL"],

      ["carburant", "ENUM('ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE') NULL"],

      ["nb_places", "TINYINT UNSIGNED NULL"],

      ["kilometrage", "INT NOT NULL DEFAULT 0"],

      [
        "segment_parc",
        "ENUM('LCD','LLD','LEASING','IMPRO','AUTRE') NOT NULL DEFAULT 'LCD'",
      ],

      ["groupe_geolocalisation", "VARCHAR(80) NULL"],

      ["id_centre", "INT NULL"],

      ["date_mise_en_service", "DATE NULL"],

      ["date_entree_parc", "DATE NULL"],

      ["date_sortie_parc", "DATE NULL"],

      ["prix_achat", "DECIMAL(14,2) NULL"],

      ["date_achat", "DATE NULL"],

      ["prix_vente", "DECIMAL(14,2) NULL"],

      [
        "statut",
        "ENUM('ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE','RETOUR_INTERNE','ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION') NOT NULL DEFAULT 'ENTREE_PARC'",
      ],

      ["date_prochaine_visite_technique", "DATE NULL"],

      ["date_expiration_assurance", "DATE NULL"],

      ["observation", "VARCHAR(255) NULL"],

      ["id_categorie", "INT NULL"],

      ["id_administrateur", "INT NULL"],

      ["cree_le", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ]

    for (const [column, definition] of vehicleColumns) {
      await ensureColumn("vehicule_sous_location", column, definition)
    }

    const [missingVehicleAdmins] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM vehicule_sous_location
        WHERE id_administrateur IS NULL`,
    )

    if (Number(missingVehicleAdmins[0]?.total) > 0) {
      const [admins] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT MIN(id_administrateur) AS id FROM administrateur",
      )

      const adminId = admins[0]?.id

      if (adminId == null) {
        throw new Error(
          "Créez un administrateur avant de migrer les véhicules de sous-location existants.",
        )
      }

      await pool.query(
        "UPDATE vehicule_sous_location SET id_administrateur = ? WHERE id_administrateur IS NULL",

        [adminId],
      )
    }

    if (await isColumnNullable("vehicule_sous_location", "id_administrateur")) {
      await pool.query(
        "ALTER TABLE vehicule_sous_location MODIFY COLUMN id_administrateur INT NOT NULL",
      )
    }

    await ensureIndex(
      "vehicule_sous_location",

      "uq_sous_location_vehicule_immat",

      "UNIQUE INDEX uq_sous_location_vehicule_immat (immatriculation_normalisee)",
    )

    await ensureIndex(
      "vehicule_sous_location",

      "idx_sous_vehicule_statut",

      "INDEX idx_sous_vehicule_statut (statut)",
    )

    await ensureIndex(
      "vehicule_sous_location",

      "idx_sous_vehicule_immat",

      "INDEX idx_sous_vehicule_immat (immatriculation)",
    )

    await ensureIndex(
      "vehicule_sous_location",

      "uq_sous_vehicule_vin",

      "UNIQUE INDEX uq_sous_vehicule_vin (numero_chassis)",
    )

    await ensureForeignKey(
      "vehicule_sous_location",

      "fk_sous_vehicule_categorie",

      "FOREIGN KEY (id_categorie) REFERENCES categorie_vehicule(id_categorie)",
    )

    await ensureForeignKey(
      "vehicule_sous_location",

      "fk_sous_vehicule_centre",

      "FOREIGN KEY (id_centre) REFERENCES centre(id_centre) ON DELETE SET NULL",
    )

    await ensureForeignKey(
      "vehicule_sous_location",

      "fk_sous_vehicule_admin",

      "FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur)",
    )

    await ensureForeignKey(
      "vehicule_sous_location",

      "fk_sous_vehicule_modele",

      "FOREIGN KEY (marque, modele) REFERENCES modele_vehicule(marque, nom) ON UPDATE CASCADE",
    )

    await ensureCheck(
      "vehicule_sous_location",

      "ck_sous_vehicule_km",

      "kilometrage >= 0",
    )

    await ensureCheck(
      "vehicule_sous_location",

      "ck_sous_vehicule_dates",

      "date_sortie_parc IS NULL OR date_entree_parc IS NULL OR date_sortie_parc >= date_entree_parc",
    )

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sous_location (
        id_sous_location INT AUTO_INCREMENT PRIMARY KEY,
        numero_contrat VARCHAR(30) NULL UNIQUE,
        type_location ENUM('COURTE_DUREE','LONGUE_DUREE') NOT NULL,
        date_debut DATETIME NOT NULL,
        date_fin_prevue DATETIME NOT NULL,
        montant_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        statut ENUM('EN_COURS','TERMINEE','EN_RETARD','EN_PROLONGATION') NOT NULL DEFAULT 'EN_COURS',
        statut_paiement ENUM('NON_PAYEE','PARTIELLE','PAYEE') NOT NULL DEFAULT 'NON_PAYEE',
        observation VARCHAR(255) NULL,
        mode_paiement_import VARCHAR(80) NULL,
        reference_facture_import VARCHAR(30) NULL,
        date_facturation_import DATE NULL,
        date_paiement_import DATE NULL,
        paye_import VARCHAR(10) NULL,
        date_retour_reelle DATETIME NULL,
        id_client INT NOT NULL,
        id_vehicule_sous_location INT NOT NULL,
        id_commercial INT NULL,
        id_administrateur INT NOT NULL,
        CONSTRAINT fk_sous_location_client FOREIGN KEY (id_client)
          REFERENCES client(id_client),
        CONSTRAINT fk_sous_location_vehicule FOREIGN KEY (id_vehicule_sous_location)
          REFERENCES vehicule_sous_location(id_vehicule_sous_location),
        CONSTRAINT fk_sous_location_commercial FOREIGN KEY (id_commercial)
          REFERENCES commercial(id_commercial) ON DELETE SET NULL,
        CONSTRAINT fk_sous_location_admin FOREIGN KEY (id_administrateur)
          REFERENCES administrateur(id_administrateur),
        CONSTRAINT ck_sous_location_dates CHECK (date_fin_prevue > date_debut),
        INDEX idx_sous_location_vehicle_dates
          (id_vehicule_sous_location, date_debut, date_fin_prevue),
        INDEX idx_sous_location_client (id_client),
        INDEX idx_sous_location_status (statut)
      ) ENGINE=InnoDB
    `)

    await ensureColumn("sous_location", "date_retour_reelle", "DATETIME NULL")

    await ensureColumn(
      "mouvement_vehicule",
      "id_vehicule_sous_location",
      "INT NULL",
    )

    await ensureColumn("mouvement_vehicule", "id_sous_location", "INT NULL")

    if (!(await hasColumn("mouvement_vehicule", "id_vehicule"))) {
      throw new Error("La colonne mouvement_vehicule.id_vehicule est absente.")
    }

    await pool.query(
      "ALTER TABLE mouvement_vehicule MODIFY COLUMN id_vehicule INT NULL",
    )

    await ensureIndex(
      "mouvement_vehicule",

      "idx_mvt_sous_vehicule_date",

      "INDEX idx_mvt_sous_vehicule_date (id_vehicule_sous_location, date_mouvement)",
    )

    await ensureIndex(
      "mouvement_vehicule",

      "idx_mvt_sous_location",

      "INDEX idx_mvt_sous_location (id_sous_location)",
    )

    await ensureForeignKey(
      "mouvement_vehicule",

      "fk_mvt_sous_vehicule",

      "FOREIGN KEY (id_vehicule_sous_location) REFERENCES vehicule_sous_location(id_vehicule_sous_location)",
    )

    await ensureForeignKey(
      "mouvement_vehicule",

      "fk_mvt_sous_location",

      "FOREIGN KEY (id_sous_location) REFERENCES sous_location(id_sous_location) ON DELETE CASCADE",
    )

    await ensureCheck(
      "mouvement_vehicule",

      "ck_mvt_vehicle_ref",

      "(id_vehicule IS NOT NULL AND id_vehicule_sous_location IS NULL) OR (id_vehicule IS NULL AND id_vehicule_sous_location IS NOT NULL)",
    )

    console.log(
      "Migration des véhicules, locations et mouvements de sous-location terminée.",
    )
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration des sous-locations impossible :",

    error instanceof Error ? error.message : error,
  )

  process.exitCode = 1
})
