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
    const [tableRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contravention'`,
    )

    if (Number(tableRows[0]?.total) === 0) {
      throw new Error(
        `La table contravention n'existe pas dans ${env.DB_NAME}. Initialisez la base avant cette migration.`,
      )
    }

    for (const [name, definition] of [
      ["client_import", "VARCHAR(180) NULL"],

      ["commercial_import", "VARCHAR(180) NULL"],
    ]) {
      const [columns] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'contravention'
            AND COLUMN_NAME = ?`,

        [name],
      )

      if (Number(columns[0]?.total) === 0) {
        await pool.query(
          `ALTER TABLE contravention ADD COLUMN ${name} ${definition}`,
        )
      }
    }

    console.log(
      `Migration du module contraventions appliquée à ${env.DB_NAME}.`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Échec de la migration des contraventions :", error)

  process.exitCode = 1
})
