import mysql from "mysql2/promise"

import { loadEnv } from "../config/env.js"

const legacyStatuses =
  "'EN_ATTENTE','CONFIRMEE','REPORTEE','TRANSFORMEE_EN_LOCATION','EXPIREE'"

async function main(): Promise<void> {
  const env = loadEnv()

  if (env.DB_DRIVER !== "mysql") {
    throw new Error(
      "Cette migration exige DB_DRIVER=mysql dans server/.env.",
    )
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
    const ensureColumn = async (
      name: string,

      definition: string,
    ): Promise<void> => {
      const [columns] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'reservation'
            AND COLUMN_NAME = ?`,

        [name],
      )

      if (Number(columns[0]?.total) === 0) {
        await pool.query(
          `ALTER TABLE reservation ADD COLUMN ${name} ${definition}`,
        )
      }
    }

    const [tables] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'reservation'`,
    )

    if (Number(tables[0]?.total) === 0) {
      throw new Error(
        `La table reservation n'existe pas dans la base ${env.DB_NAME}. Initialisez d'abord la base.`,
      )
    }

    const [confirmationColumn] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'reservation'
          AND COLUMN_NAME = 'statut_confirmation_import'`,
    )

    if (Number(confirmationColumn[0]?.total) === 0) {
      await pool.query(
        "ALTER TABLE reservation ADD COLUMN statut_confirmation_import VARCHAR(80) NULL AFTER detail_non_aboutissement",
      )
    }

    const [check] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'reservation'
          AND CONSTRAINT_NAME = 'ck_resa_dates_requises'`,
    )

    if (Number(check[0]?.total) > 0) {
      await pool.query(
        "ALTER TABLE reservation DROP CHECK ck_resa_dates_requises",
      )
    }

    await ensureColumn("client_import", "VARCHAR(180) NULL")

    await ensureColumn("commercial_import", "VARCHAR(180) NULL")

    await ensureColumn("duree_jours_import", "INT NULL")

    await pool.query(`
      ALTER TABLE reservation
      MODIFY date_reservation DATE NULL DEFAULT (CURRENT_DATE),
      MODIFY id_client INT NULL,
      MODIFY id_commercial INT NULL
    `)

    await pool.query(`
      ALTER TABLE reservation
      MODIFY statut ENUM(
        'EN_ATTENTE','CONFIRMEE','REPORTEE','TRANSFORMEE_EN_LOCATION','ANNULEE','EXPIREE',
        'A_VENIR','EN_COURS','TERMINEE'
      ) NOT NULL DEFAULT 'EN_ATTENTE'
    `)

    await pool.query(`
      UPDATE reservation r
      LEFT JOIN location l ON l.id_reservation = r.id_reservation
         SET r.statut = CASE
           WHEN r.statut IN ('ANNULEE','EXPIREE') THEN 'ANNULEE'
           WHEN r.statut = 'TRANSFORMEE_EN_LOCATION' AND l.statut = 'TERMINEE' THEN 'TERMINEE'
           WHEN r.statut = 'TRANSFORMEE_EN_LOCATION' THEN 'EN_COURS'
           WHEN r.statut IN ('EN_ATTENTE','CONFIRMEE','REPORTEE') THEN 'A_VENIR'
           ELSE r.statut
         END
       WHERE r.statut IN (${legacyStatuses})`)

    await pool.query(`
      ALTER TABLE reservation
      MODIFY statut ENUM('A_VENIR','EN_COURS','TERMINEE','ANNULEE')
      NOT NULL DEFAULT 'A_VENIR'
    `)

    await pool.query(`
      UPDATE reservation
         SET statut = 'ANNULEE'
       WHERE statut = 'A_VENIR'
         AND date_debut_prevue IS NOT NULL
         AND TIMESTAMP(date_debut_prevue, '23:59:00') <= NOW()
    `)

    await pool.query(`
      UPDATE reservation
         SET statut = 'TERMINEE'
       WHERE statut = 'EN_COURS'
         AND date_fin_prevue IS NOT NULL
         AND TIMESTAMP(date_fin_prevue, '23:59:00') <= NOW()
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suivi_reservation (
        id_suivi INT AUTO_INCREMENT PRIMARY KEY,
        ancien_statut VARCHAR(30) NULL,
        nouveau_statut VARCHAR(30) NOT NULL,
        date_changement DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        commentaire VARCHAR(255) NULL,
        id_reservation INT NOT NULL,
        CONSTRAINT fk_suivi_resa FOREIGN KEY (id_reservation)
          REFERENCES reservation(id_reservation) ON DELETE CASCADE,
        INDEX idx_suivi_resa (id_reservation, date_changement)
      ) ENGINE=InnoDB
    `)
    await pool.query("DROP TRIGGER IF EXISTS trg_reservation_ai")
    await pool.query(`
      CREATE TRIGGER trg_reservation_ai AFTER INSERT ON reservation FOR EACH ROW
      BEGIN
        INSERT INTO suivi_reservation
          (ancien_statut, nouveau_statut, id_reservation, commentaire)
        VALUES (NULL, NEW.statut, NEW.id_reservation, 'Création de la réservation');
      END
    `)
    await pool.query("DROP TRIGGER IF EXISTS trg_reservation_au")
    await pool.query(`
      CREATE TRIGGER trg_reservation_au AFTER UPDATE ON reservation FOR EACH ROW
      BEGIN
        IF OLD.statut <> NEW.statut THEN
          INSERT INTO suivi_reservation
            (ancien_statut, nouveau_statut, id_reservation, commentaire)
          VALUES (OLD.statut, NEW.statut, NEW.id_reservation, 'Statut modifié');
        END IF;
      END
    `)

    await pool.query("DROP TRIGGER IF EXISTS trg_location_ai")

    await pool.query(`
      CREATE TRIGGER trg_location_ai AFTER INSERT ON location FOR EACH ROW
      BEGIN
        IF NEW.id_reservation IS NOT NULL THEN
          UPDATE reservation
             SET statut = 'EN_COURS'
           WHERE id_reservation = NEW.id_reservation;
        END IF;
        IF COALESCE(@import_historique, 0) = 0 THEN
          INSERT INTO mouvement_vehicule
            (type_mouvement, motif, date_mouvement, date_retour_prevue, kilometrage,
             id_vehicule, id_lieu, id_conducteur, id_commercial, id_validateur, id_location)
          VALUES
            ('MISE_EN_LOCATION', 'LOCATION', NEW.date_debut, NEW.date_fin_prevue, NEW.km_depart,
             NEW.id_vehicule, NEW.id_lieu_depart, NEW.id_conducteur, NEW.id_commercial, NEW.id_commercial, NEW.id_location);
        END IF;
      END
    `)

    await pool.query("DROP TRIGGER IF EXISTS trg_location_au")

    await pool.query(`
      CREATE TRIGGER trg_location_au AFTER UPDATE ON location FOR EACH ROW
      BEGIN
        DECLARE v_depart INT;
        IF OLD.date_retour_reelle IS NULL AND NEW.date_retour_reelle IS NOT NULL
           AND NEW.id_reservation IS NOT NULL THEN
          UPDATE reservation
             SET statut = 'TERMINEE'
           WHERE id_reservation = NEW.id_reservation;
        END IF;
        IF OLD.date_retour_reelle IS NULL AND NEW.date_retour_reelle IS NOT NULL
           AND COALESCE(@import_historique, 0) = 0 THEN
          SELECT id_mouvement INTO v_depart
            FROM mouvement_vehicule
           WHERE id_location = NEW.id_location
             AND type_mouvement = 'MISE_EN_LOCATION'
           LIMIT 1;
          INSERT INTO mouvement_vehicule
            (type_mouvement, motif, date_mouvement, kilometrage, id_vehicule, id_lieu,
             id_conducteur, id_commercial, id_mouvement_depart, id_location)
          VALUES
            ('RETOUR_LOCATION', 'LOCATION', NEW.date_retour_reelle, NEW.km_retour, NEW.id_vehicule,
             COALESCE(NEW.id_lieu_retour, NEW.id_lieu_depart), NEW.id_conducteur, NEW.id_commercial, v_depart, NEW.id_location);
        END IF;
      END
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_vehicules_remplacement_disponibles AS
      SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
             cat.libelle AS categorie
        FROM vehicule v
        JOIN categorie_vehicule cat ON cat.id_categorie = v.id_categorie
       WHERE v.statut IN ('ENTREE_PARC','RETOUR_LOCATION','RETOUR_INTERNE','RETOUR_GARAGE')
         AND NOT EXISTS (
           SELECT 1 FROM reservation r
            WHERE r.id_vehicule = v.id_vehicule
              AND r.statut IN ('A_VENIR','EN_COURS')
              AND CURRENT_DATE BETWEEN r.date_debut_prevue AND r.date_fin_prevue
         )
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_etat_reservations AS
      SELECT r.id_reservation, r.date_reservation, r.date_debut_prevue, r.date_fin_prevue,
             r.duree_jours, v.immatriculation,
             CONCAT(v.marque, ' ', v.modele) AS vehicule,
             COALESCE(NULLIF(CONCAT_WS(' ', c.prenom, c.nom), ''), r.client_import, '') AS client,
             COALESCE(NULLIF(CONCAT_WS(' ', co.prenom, co.nom), ''), r.commercial_import, '') AS agent_de_vente,
             r.mission, r.lieu_mission, r.statut, r.statut_paiement, r.statut_facturation,
             r.statut AS etat_resa, (l.id_location IS NOT NULL) AS aboutie
        FROM reservation r
        JOIN vehicule v ON v.id_vehicule = r.id_vehicule
        LEFT JOIN client c ON c.id_client = r.id_client
        LEFT JOIN commercial co ON co.id_commercial = r.id_commercial
        LEFT JOIN location l ON l.id_reservation = r.id_reservation
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_synthese_reservations AS
      SELECT SUM(etat_resa = 'A_VENIR') AS resa_a_venir,
             SUM(etat_resa = 'EN_COURS') AS en_cours,
             SUM(etat_resa = 'TERMINEE') AS terminees,
             SUM(etat_resa = 'ANNULEE') AS annulees,
             COUNT(*) AS total
        FROM v_etat_reservations
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_reservations_abouties AS
      SELECT * FROM v_etat_reservations WHERE aboutie = 1
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_reservations_non_abouties AS
      SELECT * FROM v_etat_reservations WHERE etat_resa = 'ANNULEE'
    `)

    await pool.query(`
      CREATE OR REPLACE VIEW v_performance_commerciaux AS
      SELECT t.*, ROUND(100 * t.nb_reservations_abouties /
                    NULLIF(t.nb_reservations, 0), 1) AS taux_transformation_pct
        FROM (
          SELECT c.id_commercial, CONCAT_WS(' ', c.prenom, c.nom) AS commercial,
                 c.abreviation,
                 (SELECT a.code FROM agence a WHERE a.id_agence = c.id_agence) AS agence,
                 (SELECT COUNT(*) FROM reservation r
                   WHERE r.id_commercial = c.id_commercial) AS nb_reservations,
                 (SELECT COUNT(*) FROM reservation r
                   JOIN location l ON l.id_reservation = r.id_reservation
                   WHERE r.id_commercial = c.id_commercial) AS nb_reservations_abouties,
                 (SELECT COUNT(*) FROM reservation r
                   WHERE r.id_commercial = c.id_commercial
                     AND r.statut = 'ANNULEE') AS nb_reservations_non_abouties,
                 (SELECT COUNT(*) FROM affaire_perdue a
                   WHERE a.id_commercial = c.id_commercial) AS nb_affaires_perdues,
                 (SELECT COUNT(*) FROM location l
                   WHERE l.id_commercial = c.id_commercial) AS nb_locations,
                 (SELECT COALESCE(SUM(l.montant_total), 0) FROM location l
                   WHERE l.id_commercial = c.id_commercial) AS montant_locations,
                 (SELECT COALESCE(SUM(lf.montant_ht), 0)
                    FROM ligne_facture lf JOIN location l ON l.id_location = lf.id_location
                   WHERE l.id_commercial = c.id_commercial) AS ca_facture_ht
            FROM commercial c
        ) t
    `)

    console.log("Migration du cycle de vie des réservations terminée.")
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration du cycle de vie des réservations impossible :",

    error instanceof Error ? error.message : error,
  )

  process.exitCode = 1
})
