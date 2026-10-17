import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { loadEnv } from "../config/env.js"
import { splitSqlStatements } from "./sql.js"

const here = dirname(fileURLToPath(import.meta.url))
const importedTables = [
  "commercial",
  "client",
  "centre",
  "garage",
  "vehicule",
  "mouvement_vehicule",
  "sinistre",
  "passage_garage",
  "reservation",
  "location",
]

async function main(): Promise<void> {
  const env = loadEnv()
  if (env.DB_DRIVER !== "mysql") {
    throw new Error("db:import-parc exige DB_DRIVER=mysql.")
  }

  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 1,
    dateStrings: true,
  })
  const connection = await pool.getConnection()
  const lockName = `hertz-parc-import-${env.DB_NAME}`.slice(0, 64)
  let hasLock = false

  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [lockName])
    hasLock = Number((lockRows as Array<{ acquired: number | null }>)[0].acquired) === 1
    if (!hasLock) throw new Error("Un autre import du parc est déjà en cours.")

    for (const table of importedTables) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${table}\``)
      const count = Number((rows as Array<{ row_count: number }>)[0].row_count)
      if (count > 0) {
        throw new Error(
          `Import refusé : la table ${table} contient déjà ${count} ligne(s). Aucune donnée importée.`,
        )
      }
    }

    const [adminRows] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM administrateur WHERE id_administrateur = 1",
    )
    const [agencyRows] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM agence WHERE code IN ('APS', 'AEP', 'AGT')",
    )
    const [modelRows] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM modele_vehicule WHERE id_categorie IS NOT NULL",
    )
    if (
      Number((adminRows as Array<{ row_count: number }>)[0].row_count) !== 1 ||
      Number((agencyRows as Array<{ row_count: number }>)[0].row_count) !== 3 ||
      Number((modelRows as Array<{ row_count: number }>)[0].row_count) === 0
    ) {
      throw new Error(
        "Import refusé : les données de référence doivent être préparées par db:migrate.",
      )
    }

    const sql = await readFile(join(here, "donnees_initiales_parc_agents.sql"), "utf8")
    const statements = splitSqlStatements(sql)
    await connection.beginTransaction()
    try {
      for (const statement of statements) {
        await connection.query(statement)
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
    console.log(`Import du parc Hertz terminé dans ${env.DB_NAME}.`)
  } finally {
    if (hasLock) await connection.query("SELECT RELEASE_LOCK(?)", [lockName])
    connection.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Échec db:import-parc :", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
