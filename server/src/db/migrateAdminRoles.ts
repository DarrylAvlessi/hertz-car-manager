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
          AND TABLE_NAME = 'administrateur'`,
    )
    if (Number(tables[0]?.total) === 0) {
      throw new Error(
        `La table administrateur n’existe pas dans la base ${env.DB_NAME}.`,
      )
    }

    const [columns] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'administrateur'
          AND COLUMN_NAME = 'role'`,
    )

    if (Number(columns[0]?.total) === 0) {
      await pool.query(
        `ALTER TABLE administrateur
           ADD COLUMN role ENUM('responsable', 'admin', 'superadmin')
             NOT NULL DEFAULT 'responsable' AFTER actif`,
      )
      console.log("Colonne administrateur.role ajoutée.")
    } else {
      console.log("Colonne administrateur.role déjà présente.")
    }
    console.log("Migration des rôles administrateur terminée.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration des rôles administrateur impossible :",
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
})
