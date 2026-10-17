// Initializes only an empty database. Never run this against the populated Hertz database.
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { loadEnv } from "../config/env.js"
import { splitSqlStatements } from "./sql.js"

const here = dirname(fileURLToPath(import.meta.url))

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
