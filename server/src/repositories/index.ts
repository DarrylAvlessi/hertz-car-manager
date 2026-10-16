import type { Env } from "../config/env.js"
import { checkConnection, getPool } from "../db/pool.js"
import { memoryRepositories } from "./memory/index.js"
import { mysqlRepositories } from "./mysql/index.js"
import type { Repositories } from "./types.js"

let cache: Repositories | null = null

export async function repositories(env: Env): Promise<Repositories> {
  if (cache) return cache
  if (env.DB_DRIVER === "mysql") {
    try {
      await checkConnection(env)
    } catch {
      console.error(
        `MySQL injoignable (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}). ` +
          "Vérifiez server/.env puis : docker compose up -d && npm run db:migrate",
      )
      process.exit(1)
    }
    cache = mysqlRepositories(getPool(env))
    console.log("Stockage : MySQL")
  } else {
    cache = await memoryRepositories()
    console.log("Stockage : mémoire (DB_DRIVER=memory — basculez sur mysql quand la BDD est prête)")
  }
  return cache
}
