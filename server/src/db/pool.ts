import mysql from "mysql2/promise"
import type { Env } from "../config/env.js"

let pool: mysql.Pool | null = null

export function getPool(env: Env): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true,
    })
  }
  return pool
}

export async function checkConnection(env: Env): Promise<void> {
  const connection = await getPool(env).getConnection()
  try {
    await connection.query("SELECT 1")
  } finally {
    connection.release()
  }
}
