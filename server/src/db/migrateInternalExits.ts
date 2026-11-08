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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sortie_interne (
        id_sortie INT AUTO_INCREMENT PRIMARY KEY,
        id_mouvement_depart INT NOT NULL UNIQUE,
        id_mouvement_retour INT NULL UNIQUE,
        id_commercial INT NOT NULL,
        motif VARCHAR(255) NOT NULL,
        date_depart DATETIME NOT NULL,
        date_retour DATETIME NULL,
        CONSTRAINT fk_sortie_interne_depart FOREIGN KEY (id_mouvement_depart)
          REFERENCES mouvement_vehicule(id_mouvement) ON DELETE CASCADE,
        CONSTRAINT fk_sortie_interne_retour FOREIGN KEY (id_mouvement_retour)
          REFERENCES mouvement_vehicule(id_mouvement) ON DELETE SET NULL,
        CONSTRAINT fk_sortie_interne_commercial FOREIGN KEY (id_commercial)
          REFERENCES commercial(id_commercial),
        INDEX idx_sortie_interne_dates (date_depart, date_retour)
      ) ENGINE=InnoDB
    `)
    console.log("La table des sorties internes est disponible.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration des sorties internes impossible :",
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
})
