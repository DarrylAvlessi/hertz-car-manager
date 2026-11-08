import mysql from "mysql2/promise"
import { loadEnv } from "../config/env.js"

const columns = [
  ["mode_paiement_import", "VARCHAR(80) NULL"],
  ["reference_facture_import", "VARCHAR(30) NULL"],
  ["date_facturation_import", "DATE NULL"],
  ["date_paiement_import", "DATE NULL"],
  ["paye_import", "VARCHAR(10) NULL"],
] as const

async function main(): Promise<void> {
  const env = loadEnv()
  if (env.DB_DRIVER !== "mysql") {
    throw new Error(
      "Cette migration exige DB_DRIVER=mysql dans server/.env.",
    )
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

  try {
    const [tables] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'location'`,
    )
    if (Number(tables[0]?.total) === 0) {
      throw new Error(
        `La table location n'existe pas dans la base ${env.DB_NAME}. Initialisez d'abord la base.`,
      )
    }

    for (const [column, definition] of columns) {
      const [existing] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'location'
            AND COLUMN_NAME = ?`,
        [column],
      )
      if (Number(existing[0]?.total) === 0) {
        await pool.query(`ALTER TABLE location ADD COLUMN ${column} ${definition}`)
        console.log(`Colonne location.${column} ajoutée.`)
      } else {
        console.log(`Colonne location.${column} déjà présente.`)
      }
    }
    console.log("Migration facturation/paiement des locations terminée.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration facturation/paiement impossible :",
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
})
