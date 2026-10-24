// Initializes only an empty database. Never run this against the populated Hertz database.
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { loadEnv } from "../config/env.js"
import { splitSqlStatements } from "./sql.js"

const here = dirname(fileURLToPath(import.meta.url))

const vehicleForeignKeys = [
  ["reservation", "fk_resa_vehicule", "id_vehicule"],
  ["location", "fk_loc_vehicule", "id_vehicule"],
  ["passage_garage", "fk_pg_vehicule", "id_vehicule"],
  ["passage_garage", "fk_pg_remplace", "id_vehicule_remplacement"],
  ["sinistre", "fk_sinistre_vehicule", "id_vehicule"],
  ["mouvement_vehicule", "fk_mvt_vehicule", "id_vehicule"],
  ["vente_vehicule", "fk_vente_vehicule", "id_vehicule"],
  ["contravention", "fk_contrav_vehicule", "id_vehicule"],
] as const

async function applyVehiculeReferences(connection: mysql.PoolConnection): Promise<void> {
  // Idempotent : sur un schéma déjà complet, rien n'est modifié.
  for (const [table, constraint, column] of vehicleForeignKeys) {
    const [existingConstraint] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [table, constraint],
    )
    if (existingConstraint.length === 0) {
      await connection.query(
        `ALTER TABLE \`${table}\`
         ADD CONSTRAINT \`${constraint}\`
         FOREIGN KEY (\`${column}\`) REFERENCES vehicule(id_vehicule)`,
      )
    }
  }

  const [vehiclePurchaseColumns] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'vehicule'
        AND COLUMN_NAME IN ('prix_achat', 'date_achat')`,
  )
  const existingPurchaseColumns = new Set(vehiclePurchaseColumns.map((row) => row.COLUMN_NAME))
  if (!existingPurchaseColumns.has("prix_achat")) {
    await connection.query("ALTER TABLE vehicule ADD COLUMN prix_achat DECIMAL(14,2) NULL CHECK (prix_achat IS NULL OR prix_achat >= 0) AFTER date_sortie_parc")
  }
  if (!existingPurchaseColumns.has("date_achat")) {
    await connection.query("ALTER TABLE vehicule ADD COLUMN date_achat DATE NULL AFTER prix_achat")
  }
  const [movementLocationConstraint] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'mouvement_vehicule'
        AND CONSTRAINT_NAME = 'fk_mvt_location'`,
  )
  if (movementLocationConstraint[0]?.DELETE_RULE !== "SET NULL") {
    if (movementLocationConstraint.length > 0) {
      await connection.query("ALTER TABLE mouvement_vehicule DROP FOREIGN KEY fk_mvt_location")
    }
    await connection.query(
      "ALTER TABLE mouvement_vehicule ADD CONSTRAINT fk_mvt_location FOREIGN KEY (id_location) REFERENCES location(id_location) ON DELETE SET NULL",
    )
  }
  const [prolongationStatusColumn] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'prolongation_location'
        AND COLUMN_NAME = 'statut'`,
  )
  if (prolongationStatusColumn.length === 0) {
    await connection.query(
      "ALTER TABLE prolongation_location ADD COLUMN statut ENUM('EN_COURS','EXPIRE') NOT NULL DEFAULT 'EN_COURS' AFTER nouvelle_date_fin",
    )
  }
  await connection.query(`
    ALTER TABLE location
    MODIFY statut ENUM('EN_COURS','TERMINEE','EN_RETARD','EN_PROLONGATION')
    NOT NULL DEFAULT 'EN_COURS'
  `)
  await connection.query(`
    ALTER TABLE reparation
    MODIFY date_reparation DATETIME NOT NULL
  `)
  await connection.query(`
    INSERT INTO reparation (description, date_reparation, cout, id_passage)
    SELECT COALESCE(NULLIF(p.motif, ''), 'Réparation effectuée au garage'),
           COALESCE(p.date_sortie_reelle, CURRENT_TIMESTAMP),
           p.cout_total,
           p.id_passage
    FROM passage_garage p
    LEFT JOIN reparation r ON r.id_passage = p.id_passage
    WHERE p.statut = 'TERMINEE' AND r.id_reparation IS NULL
  `)
  await connection.query(`
    ALTER TABLE vehicule
    MODIFY statut ENUM(
      'DISPONIBLE','LOUE','EN_SORTIE','AU_GARAGE','IMMOBILISE','VENDU',
      'ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE',
      'RETOUR_INTERNE','ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION'
    ) NOT NULL DEFAULT 'ENTREE_PARC'
  `)
  await connection.query(`
    UPDATE vehicule
    SET statut = CASE statut
      WHEN 'DISPONIBLE' THEN 'ENTREE_PARC'
      WHEN 'LOUE' THEN 'MISE_EN_LOCATION'
      WHEN 'EN_SORTIE' THEN 'SORTIE_INTERNE'
      WHEN 'AU_GARAGE' THEN 'ENVOI_GARAGE'
      WHEN 'IMMOBILISE' THEN 'ENVOI_GARAGE'
      WHEN 'VENDU' THEN 'SORTIE_DEFINITIVE'
      ELSE statut
    END
  `)
  await connection.query(`
    ALTER TABLE vehicule
    MODIFY statut ENUM(
      'ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE',
      'RETOUR_INTERNE','ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION'
    ) NOT NULL DEFAULT 'ENTREE_PARC'
  `)
  await connection.query(`
    ALTER TABLE mouvement_vehicule
    MODIFY type_mouvement ENUM(
      'ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE',
      'RETOUR_INTERNE','ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION'
    ) NOT NULL
  `)
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (env.DB_DRIVER !== "mysql") {
    throw new Error("db:migrate exige DB_DRIVER=mysql.")
  }
  if (!/^[A-Za-z0-9_]+$/.test(env.DB_NAME)) {
    throw new Error("DB_NAME ne peut contenir que des lettres, chiffres et underscores.")
  }

  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 1,
    dateStrings: true,
  })

  let connection: mysql.PoolConnection | undefined
  try {
    connection = await pool.getConnection()
    const [databaseRows] = await connection.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [env.DB_NAME],
    )
    const databaseExists = (databaseRows as Array<{ SCHEMA_NAME: string }>).length > 0

    if (databaseExists) {
      const [objectRows] = await connection.query(
        `SELECT
           (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?) +
           (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?) +
           (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?) +
           (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?) AS object_count`,
        [env.DB_NAME, env.DB_NAME, env.DB_NAME, env.DB_NAME],
      )
      const objectCount = Number((objectRows as Array<{ object_count: number }>)[0].object_count)
      if (objectCount > 0) {
        throw new Error(
          `Refus de migration : ${env.DB_NAME} contient déjà ${objectCount} objet(s). ` +
            "Aucune donnée n'a été modifiée.",
        )
      }
    } else {
      await connection.query(
        `CREATE DATABASE \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      )
    }

    await connection.changeUser({ database: env.DB_NAME })
    for (const file of ["schema.sql", "seed.sql"]) {
      const sql = await readFile(join(here, file), "utf8")
      const statements = splitSqlStatements(sql)
      console.log(`${file} : ${statements.length} instructions...`)
      for (const statement of statements) {
        await connection.query(statement)
      }
      if (file === "schema.sql") {
        await applyVehiculeReferences(connection)
      }
    }
    console.log(`Schéma Hertz initialisé dans ${env.DB_NAME}.`)
  } finally {
    connection?.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Échec db:migrate :", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
