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
    await pool.query(
      `ALTER TABLE vente_vehicule
         MODIFY date_vente DATETIME NOT NULL,
         MODIFY date_remise_vehicule DATETIME NULL`,
    )
    console.log("Les dates de vente conservent désormais l'heure.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration des heures de vente impossible :",
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
})
