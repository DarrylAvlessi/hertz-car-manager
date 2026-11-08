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

  try {
    const [tables] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'passage_garage'`,
    )
    if (Number(tables[0]?.total) === 0) {
      throw new Error(
        `La table passage_garage n'existe pas dans la base ${env.DB_NAME}.`,
      )
    }

    await pool.query(
      `ALTER TABLE passage_garage
         MODIFY date_entree DATETIME NOT NULL,
         MODIFY date_sortie_prevue DATETIME NULL,
         MODIFY date_sortie_reelle DATETIME NULL`,
    )
    console.log("Les dates des passages garage conservent désormais l'heure.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration des heures garage impossible :",
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
})
