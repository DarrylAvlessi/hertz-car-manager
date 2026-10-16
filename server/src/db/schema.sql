-- Hertz Bénin — schéma MySQL 8 (lot Darryl).
-- Ordre de création respectant les clés étrangères.
-- Exécution : npm run db:migrate (server/) quand MySQL est disponible.

CREATE DATABASE IF NOT EXISTS hertz_benin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hertz_benin;

CREATE TABLE IF NOT EXISTS administrateur (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('responsable', 'admin') NOT NULL DEFAULT 'responsable',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commercial (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(120) NOT NULL,
  contact VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_commercial_nom (nom)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS client (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(160) NOT NULL,
  type ENUM('Particulier', 'Entreprise') NOT NULL DEFAULT 'Particulier',
  telephone VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client_nom (nom)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicule (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  immatriculation VARCHAR(20) NOT NULL UNIQUE,
  marque_modele VARCHAR(120) NOT NULL,
  categorie VARCHAR(60) NOT NULL,
  kilometrage INT UNSIGNED NOT NULL DEFAULT 0,
  statut ENUM('Disponible', 'En location', 'Entretien', 'Indisponible')
    NOT NULL DEFAULT 'Disponible',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehicule_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL UNIQUE,
  client_id INT UNSIGNED NOT NULL,
  vehicule_id INT UNSIGNED NOT NULL,
  commercial_id INT UNSIGNED NULL,
  type ENUM('Courte durée', 'Longue durée') NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  montant DECIMAL(12, 0) NOT NULL DEFAULT 0,
  statut ENUM('En cours', 'À retourner', 'Retourné', 'Annulé')
    NOT NULL DEFAULT 'En cours',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_location_client FOREIGN KEY (client_id)
    REFERENCES client (id) ON DELETE RESTRICT,
  CONSTRAINT fk_location_vehicule FOREIGN KEY (vehicule_id)
    REFERENCES vehicule (id) ON DELETE RESTRICT,
  CONSTRAINT fk_location_commercial FOREIGN KEY (commercial_id)
    REFERENCES commercial (id) ON DELETE SET NULL,
  INDEX idx_location_vehicule_dates (vehicule_id, date_debut, date_fin),
  INDEX idx_location_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservation (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NOT NULL UNIQUE,
  client_id INT UNSIGNED NOT NULL,
  vehicule_id INT UNSIGNED NULL,
  commercial_id INT UNSIGNED NULL,
  date_depart DATE NOT NULL,
  duree_jours INT UNSIGNED NOT NULL DEFAULT 1,
  statut ENUM('En attente', 'Confirmée', 'Aboutie', 'Non aboutie', 'Annulée')
    NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_client FOREIGN KEY (client_id)
    REFERENCES client (id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservation_vehicule FOREIGN KEY (vehicule_id)
    REFERENCES vehicule (id) ON DELETE SET NULL,
  CONSTRAINT fk_reservation_commercial FOREIGN KEY (commercial_id)
    REFERENCES commercial (id) ON DELETE SET NULL,
  INDEX idx_reservation_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS maintenance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicule_id INT UNSIGNED NOT NULL,
  date_entree DATE NOT NULL,
  date_sortie DATE NULL,
  motif VARCHAR(255) NOT NULL,
  cout DECIMAL(12, 0) NOT NULL DEFAULT 0,
  remplacement_id INT UNSIGNED NULL,
  statut ENUM('En cours', 'Terminée') NOT NULL DEFAULT 'En cours',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_vehicule FOREIGN KEY (vehicule_id)
    REFERENCES vehicule (id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_remplacement FOREIGN KEY (remplacement_id)
    REFERENCES vehicule (id) ON DELETE SET NULL,
  INDEX idx_maintenance_vehicule (vehicule_id, statut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mouvement (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicule_id INT UNSIGNED NOT NULL,
  type ENUM('Acquisition', 'Mise en location', 'Retour', 'Vente', 'Maintenance')
    NOT NULL,
  date_mouvement DATE NOT NULL,
  commentaire VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mouvement_vehicule FOREIGN KEY (vehicule_id)
    REFERENCES vehicule (id) ON DELETE CASCADE,
  INDEX idx_mouvement_vehicule (vehicule_id, date_mouvement)
) ENGINE=InnoDB;
