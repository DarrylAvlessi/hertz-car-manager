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
      `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('reservation', 'affaire_perdue', 'vehicule')`,
    )

    const existingTables = new Set(tables.map((row) => String(row.TABLE_NAME)))

    for (const table of ["reservation", "affaire_perdue", "vehicule"]) {
      if (!existingTables.has(table)) {
        throw new Error(
          `La table ${table} n'existe pas dans ${env.DB_NAME}. Initialisez la base avant cette migration.`,
        )
      }
    }

    await pool.query(`
      ALTER TABLE affaire_perdue
        MODIFY id_client INT NULL,
        MODIFY id_commercial INT NULL
    `)

    const [duplicates] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id_reservation
         FROM affaire_perdue
        WHERE id_reservation IS NOT NULL
        GROUP BY id_reservation
       HAVING COUNT(*) > 1
        LIMIT 1`,
    )

    if (duplicates[0]) {
      throw new Error(
        `Plusieurs affaires perdues sont déjà liées à la réservation ${duplicates[0].id_reservation}. Fusionnez ces doublons avant de relancer la migration.`,
      )
    }

    const [uniqueIndexes] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'affaire_perdue'
          AND COLUMN_NAME = 'id_reservation'
          AND NON_UNIQUE = 0`,
    )

    if (uniqueIndexes.length === 0) {
      await pool.query(
        "ALTER TABLE affaire_perdue ADD UNIQUE KEY uq_affaire_reservation (id_reservation)",
      )
    }

    await pool.query(`
      INSERT INTO affaire_perdue
        (ref_proforma, date_reservation, ref_bon_commande, date_annulation,
         id_motif, detail_motif, vehicule_demande, id_client, id_commercial,
         id_reservation)
      SELECT r.ref_proforma, r.date_reservation, r.ref_bon_commande, CURRENT_DATE,
             r.id_motif_non_aboutissement, r.detail_non_aboutissement,
             CONCAT_WS(' ', NULLIF(v.marque, ''), NULLIF(v.modele, ''), NULLIF(v.version, '')),
             r.id_client, r.id_commercial, r.id_reservation
        FROM reservation r
        JOIN vehicule v ON v.id_vehicule = r.id_vehicule
        LEFT JOIN affaire_perdue a ON a.id_reservation = r.id_reservation
       WHERE r.statut = 'ANNULEE'
         AND a.id_affaire IS NULL
    `)

    await pool.query("DROP TRIGGER IF EXISTS trg_reservation_affaire_perdue_ai")

    await pool.query(`
      CREATE TRIGGER trg_reservation_affaire_perdue_ai
      AFTER INSERT ON reservation FOR EACH ROW
      BEGIN
        DECLARE vehicle_name VARCHAR(120);
        IF NEW.statut = 'ANNULEE' THEN
          IF NOT EXISTS (
            SELECT 1 FROM affaire_perdue WHERE id_reservation = NEW.id_reservation
          ) THEN
            SELECT CONCAT_WS(' ', NULLIF(marque, ''), NULLIF(modele, ''), NULLIF(version, ''))
              INTO vehicle_name
              FROM vehicule
             WHERE id_vehicule = NEW.id_vehicule;
            INSERT INTO affaire_perdue
              (ref_proforma, date_reservation, ref_bon_commande, date_annulation,
               id_motif, detail_motif, vehicule_demande, id_client, id_commercial,
               id_reservation)
            VALUES
              (NEW.ref_proforma, NEW.date_reservation, NEW.ref_bon_commande, CURRENT_DATE,
               NEW.id_motif_non_aboutissement, NEW.detail_non_aboutissement,
               vehicle_name, NEW.id_client, NEW.id_commercial, NEW.id_reservation);
          END IF;
        END IF;
      END
    `)

    await pool.query("DROP TRIGGER IF EXISTS trg_reservation_affaire_perdue_au")

    await pool.query(`
      CREATE TRIGGER trg_reservation_affaire_perdue_au
      AFTER UPDATE ON reservation FOR EACH ROW
      BEGIN
        DECLARE vehicle_name VARCHAR(120);
        IF NEW.statut = 'ANNULEE' AND OLD.statut <> 'ANNULEE' THEN
          IF NOT EXISTS (
            SELECT 1 FROM affaire_perdue WHERE id_reservation = NEW.id_reservation
          ) THEN
            SELECT CONCAT_WS(' ', NULLIF(marque, ''), NULLIF(modele, ''), NULLIF(version, ''))
              INTO vehicle_name
              FROM vehicule
             WHERE id_vehicule = NEW.id_vehicule;
            INSERT INTO affaire_perdue
              (ref_proforma, date_reservation, ref_bon_commande, date_annulation,
               id_motif, detail_motif, vehicule_demande, id_client, id_commercial,
               id_reservation)
            VALUES
              (NEW.ref_proforma, NEW.date_reservation, NEW.ref_bon_commande, CURRENT_DATE,
               NEW.id_motif_non_aboutissement, NEW.detail_non_aboutissement,
               vehicle_name, NEW.id_client, NEW.id_commercial, NEW.id_reservation);
          END IF;
        END IF;
      END
    `)

    console.log(
      `Migration des affaires perdues de réservations appliquée à ${env.DB_NAME}.`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Échec de la migration des affaires perdues de réservations :",
    error,
  )

  process.exitCode = 1
})
