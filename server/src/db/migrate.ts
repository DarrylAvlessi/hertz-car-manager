// Exécute schema.sql puis seed.sql (idempotent grâce à ON DUPLICATE KEY).
// Usage : npm run db:migrate (nécessite DB_DRIVER=mysql + MySQL joignable).
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { loadEnv } from "../config/env.js"

const here = dirname(fileURLToPath(import.meta.url))

function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
  return withoutComments
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(";") ? s : `${s};`))
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (env.DB_DRIVER !== "mysql") {
    console.error("db:migrate exige DB_DRIVER=mysql (actuel : memory).")
    console.error("Démarrez MySQL (docker compose up -d), renseignez server/.env, relancez.")
    process.exit(1)
  }
  // Pool sans base : la BDD peut ne pas exister encore (schema.sql la crée).
  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 2,
    dateStrings: true,
    multipleStatements: false,
  })
  for (const file of ["schema.sql", "seed.sql"]) {
    const sql = await readFile(join(here, file), "utf8")
    const statements = splitStatements(sql)
    console.log(`${file} : ${statements.length} instructions...`)
    const connection = await pool.getConnection()
    try {
      for (const stmt of statements) {
        await connection.query(stmt)
      }
    } finally {
      connection.release()
    }
  }
  await pool.end()
  console.log("Migration + seed OK.")
}

main().catch((err) => {
  console.error("Échec db:migrate :", err instanceof Error ? err.message : err)
  process.exit(1)
})
