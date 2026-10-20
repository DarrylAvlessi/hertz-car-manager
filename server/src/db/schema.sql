-- Schéma métier Hertz Bénin issu de la base de référence.
-- Les triggers, vues et procédures sont gérés séparément du schéma de migration.
SET NAMES utf8mb4;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS hertz_benin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hertz_benin;

-- =====================================================================================
-- 1. TABLES DE RÉFÉRENCE
-- =====================================================================================

-- Agences (fichier « Liste des agents de vente » : Agence principale APS, Aéroport AEP, Golden Tulip AGT)
CREATE TABLE IF NOT EXISTS agence (
  id_agence  INT AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(10)  NOT NULL UNIQUE,
  nom        VARCHAR(100) NOT NULL UNIQUE,
  adresse    VARCHAR(255) NULL,
  telephone  VARCHAR(30)  NULL,
  actif      BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- Lieux de départ / retour (remplace les adresses saisies à la main dans le journal :
-- « DIRECTION HERTZ », « Direction Hertz », « DIRECETION HERTZ », « Golden tulip »...)
CREATE TABLE IF NOT EXISTS lieu (
  id_lieu     INT AUTO_INCREMENT PRIMARY KEY,
  libelle     VARCHAR(120) NOT NULL UNIQUE,
  type_lieu   ENUM('AGENCE','AEROPORT','HOTEL','GARAGE','CLIENT','AUTRE') NOT NULL DEFAULT 'AUTRE',
  adresse     VARCHAR(255) NULL,
  ville       VARCHAR(80)  NULL,
  id_agence   INT NULL,
  CONSTRAINT fk_lieu_agence FOREIGN KEY (id_agence) REFERENCES agence(id_agence) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorie_vehicule (
  id_categorie      INT AUTO_INCREMENT PRIMARY KEY,
  libelle           VARCHAR(80)   NOT NULL UNIQUE,
  tarif_journalier  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tarif_journalier >= 0),
  tarif_mensuel     DECIMAL(12,2) NULL CHECK (tarif_mensuel IS NULL OR tarif_mensuel >= 0)
) ENGINE=InnoDB;

-- Liste fermée des modèles : empêche les fautes de frappe du fichier parc
-- (KIKS, HRDBODY, HARBODY, SOPPORTER, COROLA CROSS...). Les finitions vont dans vehicule.version.
CREATE TABLE IF NOT EXISTS modele_vehicule (
  id_modele     INT AUTO_INCREMENT PRIMARY KEY,
  marque        VARCHAR(60) NOT NULL,
  nom           VARCHAR(80) NOT NULL,
  nb_places     TINYINT UNSIGNED NULL,
  id_categorie  INT NULL,
  CONSTRAINT fk_modele_categorie FOREIGN KEY (id_categorie) REFERENCES categorie_vehicule(id_categorie) ON DELETE SET NULL,
  UNIQUE KEY uq_modele (marque, nom)
) ENGINE=InnoDB;

-- Calendrier : une ligne par jour. Sert à calculer proprement les indicateurs (jours loués, jours
-- d'immobilisation...) sans double comptage. Extensible avec CALL sp_peupler_calendrier('2050-12-31').
CREATE TABLE IF NOT EXISTS calendrier (
  jour         DATE PRIMARY KEY,
  annee        SMALLINT GENERATED ALWAYS AS (YEAR(jour)) STORED,
  mois         TINYINT  GENERATED ALWAYS AS (MONTH(jour)) STORED,
  annee_mois   CHAR(7)  GENERATED ALWAYS AS (CONCAT(YEAR(jour), '-', LPAD(MONTH(jour), 2, '0'))) STORED,
  semaine_iso  INT      GENERATED ALWAYS AS (YEARWEEK(jour, 3)) STORED,
  est_weekend  BOOLEAN  GENERATED ALWAYS AS (WEEKDAY(jour) >= 5) STORED
) ENGINE=InnoDB;

-- Motifs pour lesquels une réservation ou une affaire n'a pas abouti
CREATE TABLE IF NOT EXISTS motif_non_aboutissement (
  id_motif  INT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(40)  NOT NULL UNIQUE,
  libelle   VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

-- =====================================================================================
-- 2. ACTEURS
-- =====================================================================================

CREATE TABLE IF NOT EXISTS administrateur (
  id_administrateur  INT AUTO_INCREMENT PRIMARY KEY,
  nom                VARCHAR(80)  NOT NULL,
  prenom             VARCHAR(80)  NOT NULL,
  telephone          VARCHAR(30)  NULL,
  email              VARCHAR(120) NOT NULL UNIQUE,
  login              VARCHAR(60)  NOT NULL UNIQUE,
  mot_de_passe_hash  VARCHAR(255) NOT NULL,
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  date_creation      DATE         NOT NULL DEFAULT (CURRENT_DATE)
) ENGINE=InnoDB;

-- « Agent de vente » : le fichier Excel des locations les désigne par leurs initiales (UA, DP, RL...)
CREATE TABLE IF NOT EXISTS commercial (
  id_commercial      INT AUTO_INCREMENT PRIMARY KEY,
  nom                VARCHAR(80)  NOT NULL,
  prenom             VARCHAR(80)  NULL,
  abreviation        VARCHAR(10)  NULL UNIQUE,
  telephone          VARCHAR(30)  NULL,
  email              VARCHAR(120) NULL UNIQUE,
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  date_creation      DATE         NOT NULL DEFAULT (CURRENT_DATE),
  id_agence          INT          NULL,
  id_administrateur  INT          NOT NULL,
  CONSTRAINT fk_commercial_agence FOREIGN KEY (id_agence) REFERENCES agence(id_agence) ON DELETE SET NULL,
  CONSTRAINT fk_commercial_admin  FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur)
) ENGINE=InnoDB;

-- Les clients des fichiers sont surtout des organisations (ONUDC, BOAD, UNESCO, SOGEA SATOM...)
-- mais aussi des particuliers (Mme AFANOU, MR GOMEZ...)
CREATE TABLE IF NOT EXISTS client (
  id_client          INT AUTO_INCREMENT PRIMARY KEY,
  type_client        ENUM('PARTICULIER','ENTREPRISE','ORGANISATION') NOT NULL DEFAULT 'PARTICULIER',
  nom                VARCHAR(150) NOT NULL,           -- nom ou raison sociale
  prenom             VARCHAR(80)  NULL,
  telephone          VARCHAR(30)  NULL,
  email              VARCHAR(120) NULL,
  adresse            VARCHAR(255) NULL,
  num_permis         VARCHAR(50)  NULL UNIQUE,
  date_creation      DATE         NOT NULL DEFAULT (CURRENT_DATE),
  id_administrateur  INT          NOT NULL,
  CONSTRAINT fk_client_admin FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur),
  INDEX idx_client_nom (nom)
) ENGINE=InnoDB;

-- Personne qui conduit réellement le véhicule (colonne « UTILISATEUR / CONDUCTEUR » du journal) :
-- employé du client, chauffeur ou employé Hertz.
CREATE TABLE IF NOT EXISTS conducteur (
  id_conducteur  INT AUTO_INCREMENT PRIMARY KEY,
  nom            VARCHAR(120) NOT NULL,
  prenom         VARCHAR(80)  NULL,
  telephone      VARCHAR(30)  NULL,
  num_permis     VARCHAR(50)  NULL UNIQUE,
  categorie      ENUM('CLIENT','CHAUFFEUR_HERTZ','EMPLOYE_HERTZ','AUTRE') NOT NULL DEFAULT 'CLIENT',
  id_client      INT NULL,
  CONSTRAINT fk_conducteur_client FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE SET NULL,
  INDEX idx_conducteur_nom (nom)
) ENGINE=InnoDB;

-- =====================================================================================
-- 3. PARC DE VÉHICULES
-- =====================================================================================

-- Colonne « Centre » du fichier PARC_LCD : entité à laquelle le véhicule est rattaché
-- (ARCS BENIN, MOOV BENIN, ADMEC, SOGEA SATOM, ou une personne)
CREATE TABLE IF NOT EXISTS centre (
  id_centre    INT AUTO_INCREMENT PRIMARY KEY,
  nom          VARCHAR(120) NOT NULL UNIQUE,
  type_centre  ENUM('SOCIETE','CLIENT','PERSONNE','AUTRE') NOT NULL DEFAULT 'AUTRE',
  id_client    INT NULL,
  CONSTRAINT fk_centre_client FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicule (
  id_vehicule        INT AUTO_INCREMENT PRIMARY KEY,
  immatriculation    VARCHAR(30)  NOT NULL,           -- telle qu'affichée : « CK 2606 RB »
  -- forme normalisée : « CK2606RB » et « CK 2606 RB » désignent le même véhicule (fichiers Excel hétérogènes)
  immatriculation_normalisee VARCHAR(30) GENERATED ALWAYS AS
                     (UPPER(REPLACE(REPLACE(immatriculation, ' ', ''), '-', ''))) STORED,
  marque             VARCHAR(60)  NOT NULL,
  modele             VARCHAR(80)  NOT NULL,
  version            VARCHAR(60)  NULL,               -- DOUBLE CABINE, 4x4, SR5, PICK UP...
  annee              SMALLINT     NULL,
  numero_chassis     VARCHAR(40)  NULL UNIQUE,        -- VIN
  couleur            VARCHAR(30)  NULL,
  carburant          ENUM('ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE') NULL,   -- GO / ES / Indéfini
  nb_places          TINYINT UNSIGNED NULL,
  kilometrage        INT          NOT NULL DEFAULT 0 CHECK (kilometrage >= 0),
  segment_parc       ENUM('LCD','LLD','LEASING','IMPRO','AUTRE') NOT NULL DEFAULT 'LCD',
  groupe_geolocalisation VARCHAR(80) NULL,            -- tel que saisi dans la plateforme de géolocalisation
  id_centre          INT          NULL,
  date_mise_en_service DATE       NULL,
  date_entree_parc   DATE         NULL,
  date_sortie_parc   DATE         NULL,
  prix_achat         DECIMAL(14,2) NULL CHECK (prix_achat IS NULL OR prix_achat >= 0),
  date_achat         DATE         NULL,
  prix_vente         DECIMAL(14,2) NULL CHECK (prix_vente IS NULL OR prix_vente >= 0),
  statut             ENUM('ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE','RETOUR_INTERNE',
                           'ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION') NOT NULL DEFAULT 'ENTREE_PARC',
  date_prochaine_visite_technique DATE NULL,
  date_expiration_assurance       DATE NULL,
  observation        VARCHAR(255) NULL,               -- « Observations particulières » (ex. Utilisé par le DAF)
  id_categorie       INT NULL,
  id_administrateur  INT NOT NULL,
  UNIQUE KEY uq_vehicule_immat (immatriculation_normalisee),
  CONSTRAINT fk_vehicule_modele    FOREIGN KEY (marque, modele) REFERENCES modele_vehicule(marque, nom) ON UPDATE CASCADE,
  CONSTRAINT fk_vehicule_categorie FOREIGN KEY (id_categorie)      REFERENCES categorie_vehicule(id_categorie),
  CONSTRAINT fk_vehicule_centre    FOREIGN KEY (id_centre)         REFERENCES centre(id_centre) ON DELETE SET NULL,
  CONSTRAINT fk_vehicule_admin     FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur),
  CONSTRAINT ck_vehicule_sortie CHECK (date_sortie_parc IS NULL OR date_entree_parc IS NULL OR date_sortie_parc >= date_entree_parc),
  INDEX idx_vehicule_statut (statut),
  INDEX idx_vehicule_segment (segment_parc),
  INDEX idx_vehicule_immat (immatriculation)
) ENGINE=InnoDB;

-- =====================================================================================
-- 4. RÉSERVATIONS ET AFFAIRES PERDUES
-- =====================================================================================

-- Une ligne = une ligne du fichier « RESA ». Les 3 colonnes de statut du fichier sont conservées :
--   Statut de confirmation -> statut + statut_paiement
--   Statut de la facturation -> statut_facturation
--   Statut de la résa (à venir / en cours / terminée) -> CALCULÉ (vue v_etat_reservations)
CREATE TABLE IF NOT EXISTS reservation (
  id_reservation      INT AUTO_INCREMENT PRIMARY KEY,
  date_reservation    DATE NOT NULL DEFAULT (CURRENT_DATE),
  date_debut_prevue   DATE NULL,
  date_fin_prevue     DATE NULL,
  duree_jours         INT GENERATED ALWAYS AS (
                        CASE WHEN date_debut_prevue IS NULL OR date_fin_prevue IS NULL THEN NULL
                             ELSE GREATEST(DATEDIFF(date_fin_prevue, date_debut_prevue), 1) END) STORED,
  mission             VARCHAR(150) NULL,              -- LOCATION, transfert, sponsor, LLD...
  lieu_mission        VARCHAR(150) NULL,              -- COTONOU, PARAKOU, LOME...
  statut              ENUM('EN_ATTENTE','CONFIRMEE','REPORTEE','TRANSFORMEE_EN_LOCATION','ANNULEE','EXPIREE')
                      NOT NULL DEFAULT 'EN_ATTENTE',
  statut_paiement     ENUM('NON_PAYEE','PAYEE') NOT NULL DEFAULT 'NON_PAYEE',
  statut_facturation  ENUM('NON_FACTUREE','EN_ATTENTE_BON_COMMANDE','FACTURE_EMISE_PAIEMENT_EN_ATTENTE','PAIEMENT_EFFECTUE')
                      NOT NULL DEFAULT 'NON_FACTUREE',
  ref_proforma        VARCHAR(50) NULL,
  ref_bon_commande    VARCHAR(50) NULL,
  id_motif_non_aboutissement INT NULL,
  detail_non_aboutissement   VARCHAR(255) NULL,
  date_creation       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_client           INT NOT NULL,
  id_vehicule         INT NOT NULL,
  id_commercial       INT NOT NULL,
  id_agence           INT NULL,                       -- par défaut : agence du commercial
  CONSTRAINT fk_resa_agence     FOREIGN KEY (id_agence)     REFERENCES agence(id_agence),
  CONSTRAINT fk_resa_client     FOREIGN KEY (id_client)     REFERENCES client(id_client),
  CONSTRAINT fk_resa_vehicule   FOREIGN KEY (id_vehicule)   REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_resa_commercial FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial),
  CONSTRAINT fk_resa_motif      FOREIGN KEY (id_motif_non_aboutissement) REFERENCES motif_non_aboutissement(id_motif),
  CONSTRAINT ck_resa_dates CHECK (date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue),
  CONSTRAINT ck_resa_dates_requises CHECK (date_debut_prevue IS NOT NULL OR statut IN ('EN_ATTENTE','ANNULEE','EXPIREE')),
  INDEX idx_resa_vehicule_dates (id_vehicule, date_debut_prevue, date_fin_prevue),
  INDEX idx_resa_client (id_client),
  INDEX idx_resa_commercial (id_commercial),
  INDEX idx_resa_statut (statut)
) ENGINE=InnoDB;

-- Historique de l'évolution d'une réservation (alimenté automatiquement par trigger)
CREATE TABLE IF NOT EXISTS suivi_reservation (
  id_suivi         INT AUTO_INCREMENT PRIMARY KEY,
  ancien_statut    VARCHAR(30) NULL,
  nouveau_statut   VARCHAR(30) NOT NULL,
  date_changement  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  commentaire      VARCHAR(255) NULL,
  id_reservation   INT NOT NULL,
  CONSTRAINT fk_suivi_resa FOREIGN KEY (id_reservation) REFERENCES reservation(id_reservation) ON DELETE CASCADE,
  INDEX idx_suivi_resa (id_reservation, date_changement)
) ENGINE=InnoDB;

-- Fichier « Affaires perdues » : proformas envoyées qui n'ont pas abouti
CREATE TABLE IF NOT EXISTS affaire_perdue (
  id_affaire        INT AUTO_INCREMENT PRIMARY KEY,
  ref_proforma      VARCHAR(50)  NULL,
  date_reservation  DATE NULL,                        -- « DATE DE REZA »
  ref_bon_commande  VARCHAR(50)  NULL,                -- « REF DON DE CMD »
  date_annulation   DATE NULL,
  id_motif          INT NULL,
  detail_motif      VARCHAR(255) NULL,
  vehicule_demande  VARCHAR(120) NULL,
  vehicule_propose  VARCHAR(120) NULL,
  montant_estime    DECIMAL(14,2) NULL CHECK (montant_estime IS NULL OR montant_estime >= 0),
  id_client         INT NOT NULL,
  id_commercial     INT NOT NULL,
  id_reservation    INT NULL,                         -- si l'affaire est issue d'une réservation
  CONSTRAINT fk_affaire_client     FOREIGN KEY (id_client)      REFERENCES client(id_client),
  CONSTRAINT fk_affaire_commercial FOREIGN KEY (id_commercial)  REFERENCES commercial(id_commercial),
  CONSTRAINT fk_affaire_motif      FOREIGN KEY (id_motif)       REFERENCES motif_non_aboutissement(id_motif),
  CONSTRAINT fk_affaire_resa       FOREIGN KEY (id_reservation) REFERENCES reservation(id_reservation) ON DELETE SET NULL,
  INDEX idx_affaire_commercial (id_commercial),
  INDEX idx_affaire_client (id_client)
) ENGINE=InnoDB;

-- Colonne « RELANCE » du fichier : plusieurs relances possibles par affaire
CREATE TABLE IF NOT EXISTS relance (
  id_relance     INT AUTO_INCREMENT PRIMARY KEY,
  id_affaire     INT NOT NULL,
  date_relance   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canal          ENUM('TELEPHONE','EMAIL','WHATSAPP','VISITE','AUTRE') NOT NULL DEFAULT 'TELEPHONE',
  commentaire    VARCHAR(255) NULL,
  id_commercial  INT NULL,
  CONSTRAINT fk_relance_affaire     FOREIGN KEY (id_affaire)    REFERENCES affaire_perdue(id_affaire) ON DELETE CASCADE,
  CONSTRAINT fk_relance_commercial  FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================================
-- 5. LOCATIONS (supertype) + COURTE DURÉE / LONGUE DURÉE (sous-types)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS location (
  id_location         INT AUTO_INCREMENT PRIMARY KEY,
  numero_contrat      VARCHAR(30) NULL UNIQUE,
  type_location       ENUM('COURTE_DUREE','LONGUE_DUREE') NOT NULL,
  date_debut          DATETIME NOT NULL,
  date_fin_prevue     DATETIME NOT NULL,
  date_retour_reelle  DATETIME NULL,
  duree_jours         INT GENERATED ALWAYS AS (
                        GREATEST(DATEDIFF(DATE(COALESCE(date_retour_reelle, date_fin_prevue)), DATE(date_debut)), 1)) STORED,
  km_depart           INT NOT NULL CHECK (km_depart >= 0),
  km_retour           INT NULL,
  km_parcourus        INT GENERATED ALWAYS AS (CASE WHEN km_retour IS NULL THEN NULL ELSE km_retour - km_depart END) STORED,
  montant_total       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (montant_total >= 0),
  devise              CHAR(3) NOT NULL DEFAULT 'XOF',
  statut              ENUM('EN_COURS','TERMINEE','EN_RETARD','EN_PROLONGATION') NOT NULL DEFAULT 'EN_COURS',
  statut_paiement     ENUM('NON_PAYEE','PARTIELLE','PAYEE') NOT NULL DEFAULT 'NON_PAYEE',   -- colonne « PAYE » du suivi Excel
  avec_chauffeur      BOOLEAN NOT NULL DEFAULT FALSE,                                       -- « courses » avec chauffeur
  mission             VARCHAR(150) NULL,
  ref_bon_commande    VARCHAR(50)  NULL,
  observation         VARCHAR(255) NULL,
  id_lieu_depart      INT NULL,
  id_lieu_retour      INT NULL,
  id_agence           INT NULL,                       -- par défaut : agence du commercial
  id_reservation      INT NULL UNIQUE,                -- 0..1 : une location peut être directe
  id_client           INT NOT NULL,
  id_vehicule         INT NOT NULL,
  id_commercial       INT NOT NULL,
  id_conducteur       INT NULL,
  id_administrateur   INT NOT NULL,
  CONSTRAINT fk_loc_resa       FOREIGN KEY (id_reservation)    REFERENCES reservation(id_reservation),
  CONSTRAINT fk_loc_client     FOREIGN KEY (id_client)         REFERENCES client(id_client),
  CONSTRAINT fk_loc_vehicule   FOREIGN KEY (id_vehicule)       REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_loc_commercial FOREIGN KEY (id_commercial)     REFERENCES commercial(id_commercial),
  CONSTRAINT fk_loc_conducteur FOREIGN KEY (id_conducteur)     REFERENCES conducteur(id_conducteur) ON DELETE SET NULL,
  CONSTRAINT fk_loc_admin      FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur),
  CONSTRAINT fk_loc_lieu_dep   FOREIGN KEY (id_lieu_depart)    REFERENCES lieu(id_lieu),
  CONSTRAINT fk_loc_lieu_ret   FOREIGN KEY (id_lieu_retour)    REFERENCES lieu(id_lieu),
  CONSTRAINT fk_loc_agence     FOREIGN KEY (id_agence)         REFERENCES agence(id_agence),
  CONSTRAINT ck_loc_dates  CHECK (date_fin_prevue >= date_debut),
  CONSTRAINT ck_loc_retour CHECK (date_retour_reelle IS NULL OR date_retour_reelle >= date_debut),
  CONSTRAINT ck_loc_km     CHECK (km_retour IS NULL OR km_retour >= km_depart),
  INDEX idx_loc_vehicule_dates (id_vehicule, date_debut, date_fin_prevue),
  INDEX idx_loc_client (id_client),
  INDEX idx_loc_commercial (id_commercial),
  INDEX idx_loc_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location_courte_duree (
  id_location               INT PRIMARY KEY,           -- PK + FK vers location
  nb_jours                  INT NOT NULL CHECK (nb_jours > 0),
  tarif_journalier_applique DECIMAL(12,2) NOT NULL CHECK (tarif_journalier_applique >= 0),
  km_inclus                 INT NULL,
  supplement_km             DECIMAL(10,2) NULL,
  weekends_exclus           BOOLEAN NOT NULL DEFAULT FALSE,   -- « les week-ends ne sont pas dedans »
  CONSTRAINT fk_lcd_location FOREIGN KEY (id_location) REFERENCES location(id_location) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location_longue_duree (
  id_location             INT PRIMARY KEY,             -- PK + FK vers location
  duree_mois              INT NOT NULL CHECK (duree_mois > 0),
  loyer_mensuel           DECIMAL(14,2) NOT NULL CHECK (loyer_mensuel >= 0),
  depot_garantie          DECIMAL(14,2) NULL,
  date_prochaine_echeance DATE NULL,
  km_annuel_inclus        INT NULL,
  CONSTRAINT fk_lld_location FOREIGN KEY (id_location) REFERENCES location(id_location) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Prolongations (« PROLONGER DE 3 JOURS », « POSSIBILITE DE PROLONGEMENT ») : historique conservé,
-- la date de fin prévue et le montant de la location sont mis à jour automatiquement.
CREATE TABLE IF NOT EXISTS prolongation_location (
  id_prolongation        INT AUTO_INCREMENT PRIMARY KEY,
  id_location            INT NOT NULL,
  ancienne_date_fin      DATETIME NULL,                -- remplie par trigger
  nouvelle_date_fin      DATETIME NOT NULL,
  statut                 ENUM('EN_COURS','EXPIRE') NOT NULL DEFAULT 'EN_COURS',
  date_demande           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motif                  VARCHAR(255) NULL,
  montant_supplementaire DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (montant_supplementaire >= 0),
  id_commercial          INT NULL,
  CONSTRAINT fk_prolong_location   FOREIGN KEY (id_location)   REFERENCES location(id_location) ON DELETE CASCADE,
  CONSTRAINT fk_prolong_commercial FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Prestations complémentaires d'une location (assurance vendue, carburant, surclassement, chauffeur...)
CREATE TABLE IF NOT EXISTS option_location (
  id_option    INT AUTO_INCREMENT PRIMARY KEY,
  id_location  INT NOT NULL,
  type_option  ENUM('ASSURANCE','CARBURANT','SURCLASSEMENT','CHAUFFEUR','KM_SUPPLEMENTAIRE','LIVRAISON','AUTRE') NOT NULL,
  libelle      VARCHAR(150) NULL,
  montant      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  CONSTRAINT fk_option_location FOREIGN KEY (id_location) REFERENCES location(id_location) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================================
-- 6. FACTURATION ET PAIEMENTS
-- =====================================================================================

-- Une facture appartient à un client et peut couvrir PLUSIEURS locations
-- (ex. facture 2224 PRODIJ : 4 véhicules ; facture 2243 BOAD : 2 locations). Voir ligne_facture.
CREATE TABLE IF NOT EXISTS facture (
  id_facture        INT AUTO_INCREMENT PRIMARY KEY,
  numero_facture    VARCHAR(30) NOT NULL UNIQUE,
  date_emission     DATE NOT NULL DEFAULT (CURRENT_DATE),
  date_echeance     DATE NULL,
  montant_ht        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (montant_ht >= 0),   -- recalculé à partir des lignes
  taux_tva          DECIMAL(5,2)  NOT NULL DEFAULT 18.00 CHECK (taux_tva >= 0),
  montant_ttc       DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(montant_ht * (1 + taux_tva / 100), 2)) STORED,
  statut_paiement   ENUM('NON_PAYEE','PARTIELLE','PAYEE') NOT NULL DEFAULT 'NON_PAYEE',
  ref_bon_commande  VARCHAR(50) NULL,
  id_client         INT NOT NULL,
  CONSTRAINT fk_facture_client FOREIGN KEY (id_client) REFERENCES client(id_client),
  CONSTRAINT ck_facture_echeance CHECK (date_echeance IS NULL OR date_echeance >= date_emission),
  INDEX idx_facture_client (id_client),
  INDEX idx_facture_date (date_emission)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ligne_facture (
  id_ligne          INT AUTO_INCREMENT PRIMARY KEY,
  id_facture        INT NOT NULL,
  id_location       INT NULL,                           -- NULL pour une ligne libre (carburant, frais...)
  designation       VARCHAR(200) NOT NULL,
  quantite          DECIMAL(10,2) NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire_ht  DECIMAL(14,2) NOT NULL CHECK (prix_unitaire_ht >= 0),
  montant_ht        DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(quantite * prix_unitaire_ht, 2)) STORED,
  CONSTRAINT fk_ligne_facture  FOREIGN KEY (id_facture)  REFERENCES facture(id_facture) ON DELETE CASCADE,
  CONSTRAINT fk_ligne_location FOREIGN KEY (id_location) REFERENCES location(id_location),
  INDEX idx_ligne_location (id_location)
) ENGINE=InnoDB;

-- Encaissements. Un paiement peut régler une facture, un acompte de réservation, ou directement une
-- location payée au comptoir sans facture (TPE, espèces, Mobile Money : cas fréquent dans le suivi Excel).
-- Plusieurs paiements possibles pour un même élément (ex. chèque + solde en espèces).
CREATE TABLE IF NOT EXISTS paiement (
  id_paiement            INT AUTO_INCREMENT PRIMARY KEY,
  date_paiement          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  montant                DECIMAL(14,2) NOT NULL CHECK (montant > 0),
  moyen_paiement         ENUM('ESPECES','CARTE_BANCAIRE','CHEQUE','VIREMENT','MTN_MOMO','MOOV_MONEY','MOBILE_MONEY') NOT NULL,
  reference_transaction  VARCHAR(80) NULL,
  numero_quittance       VARCHAR(60) NULL,
  id_facture             INT NULL,
  id_reservation         INT NULL,
  id_location            INT NULL,
  id_commercial          INT NULL,
  CONSTRAINT fk_paiement_facture    FOREIGN KEY (id_facture)     REFERENCES facture(id_facture),
  CONSTRAINT fk_paiement_resa       FOREIGN KEY (id_reservation) REFERENCES reservation(id_reservation),
  CONSTRAINT fk_paiement_location   FOREIGN KEY (id_location)    REFERENCES location(id_location),
  CONSTRAINT fk_paiement_commercial FOREIGN KEY (id_commercial)  REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT ck_paiement_cible CHECK (id_facture IS NOT NULL OR id_reservation IS NOT NULL OR id_location IS NOT NULL),
  INDEX idx_paiement_date (date_paiement)
) ENGINE=InnoDB;

-- =====================================================================================
-- 7. MAINTENANCE : GARAGES, PASSAGES, RÉPARATIONS
-- =====================================================================================

CREATE TABLE IF NOT EXISTS garage (
  id_garage   INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(120) NOT NULL,
  adresse     VARCHAR(255) NULL,
  telephone   VARCHAR(30)  NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passage_garage (
  id_passage                INT AUTO_INCREMENT PRIMARY KEY,
  type_passage              ENUM('REPARATION','REVISION','ENTRETIEN','VISITE_TECHNIQUE','AUTRE') NOT NULL DEFAULT 'REPARATION',
  date_entree               DATE NOT NULL,
  date_sortie_prevue        DATE NULL,
  date_sortie_reelle        DATE NULL,
  km_entree                 INT  NULL,
  motif                     VARCHAR(255) NULL,
  statut                    ENUM('EN_ATTENTE','EN_COURS','TERMINEE') NOT NULL DEFAULT 'EN_COURS',
  cout_total                DECIMAL(14,2) NOT NULL DEFAULT 0,
  id_vehicule               INT NOT NULL,
  id_garage                 INT NOT NULL,
  id_vehicule_remplacement  INT NULL,
  CONSTRAINT fk_pg_vehicule  FOREIGN KEY (id_vehicule) REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_pg_garage   FOREIGN KEY (id_garage)   REFERENCES garage(id_garage),
  CONSTRAINT fk_pg_remplace FOREIGN KEY (id_vehicule_remplacement) REFERENCES vehicule(id_vehicule),
  CONSTRAINT ck_pg_remplace CHECK (id_vehicule_remplacement IS NULL OR id_vehicule_remplacement <> id_vehicule),
  CONSTRAINT ck_pg_dates    CHECK (date_sortie_prevue IS NULL OR date_sortie_prevue >= date_entree),
  CONSTRAINT ck_pg_sortie   CHECK (date_sortie_reelle IS NULL OR date_sortie_reelle >= date_entree),
  INDEX idx_pg_vehicule (id_vehicule, date_entree)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reparation (
  id_reparation    INT AUTO_INCREMENT PRIMARY KEY,
  description      VARCHAR(255) NOT NULL,
  date_reparation  DATETIME NOT NULL,
  cout             DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cout >= 0),
  id_passage       INT NOT NULL,
  CONSTRAINT fk_rep_passage FOREIGN KEY (id_passage) REFERENCES passage_garage(id_passage) ON DELETE CASCADE,
  INDEX idx_rep_passage (id_passage)
) ENGINE=InnoDB;

-- Accidents, épaves, pannes graves (« accidenté 24/07/2026 », « epave » dans le fichier parc)
CREATE TABLE IF NOT EXISTS sinistre (
  id_sinistre               INT AUTO_INCREMENT PRIMARY KEY,
  date_sinistre             DATE NOT NULL,
  type_sinistre             ENUM('ACCIDENT','PANNE_GRAVE','VOL','INCENDIE','EPAVE','AUTRE') NOT NULL DEFAULT 'ACCIDENT',
  description               VARCHAR(255) NULL,
  lieu_sinistre             VARCHAR(150) NULL,
  immobilisant              BOOLEAN NOT NULL DEFAULT TRUE,   -- le véhicule ne peut plus être loué
  statut                    ENUM('DECLARE','EN_EXPERTISE','EN_REPARATION','EPAVE','CLOS') NOT NULL DEFAULT 'DECLARE',
  declare_assurance         BOOLEAN NOT NULL DEFAULT FALSE,
  numero_dossier_assurance  VARCHAR(60) NULL,
  montant_estime            DECIMAL(14,2) NULL CHECK (montant_estime IS NULL OR montant_estime >= 0),
  date_cloture              DATE NULL,                       -- fin de l'immobilisation (remplie à la clôture)
  id_vehicule               INT NOT NULL,
  id_location               INT NULL,
  id_conducteur             INT NULL,
  id_passage                INT NULL,
  CONSTRAINT fk_sinistre_vehicule   FOREIGN KEY (id_vehicule)   REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_sinistre_location   FOREIGN KEY (id_location)   REFERENCES location(id_location) ON DELETE SET NULL,
  CONSTRAINT fk_sinistre_conducteur FOREIGN KEY (id_conducteur) REFERENCES conducteur(id_conducteur) ON DELETE SET NULL,
  CONSTRAINT fk_sinistre_passage    FOREIGN KEY (id_passage)    REFERENCES passage_garage(id_passage) ON DELETE SET NULL,
  CONSTRAINT ck_sinistre_cloture    CHECK (date_cloture IS NULL OR date_cloture >= date_sinistre),
  INDEX idx_sinistre_vehicule (id_vehicule, date_sinistre)
) ENGINE=InnoDB;

-- =====================================================================================
-- 8. JOURNAL DES MOUVEMENTS DES VÉHICULES
-- =====================================================================================
-- Une ligne du fichier « Journal » = 1 événement de DÉPART + 1 événement de RETOUR (lié par
-- id_mouvement_depart). L'entrée au parc et la sortie définitive sont des événements isolés.
--   Types de départ : MISE_EN_LOCATION, SORTIE_INTERNE (course, lavage, carburant...), ENVOI_GARAGE
--   Types de retour : RETOUR_LOCATION,  RETOUR_INTERNE,                              RETOUR_GARAGE
-- La vue v_journal_mouvements reconstitue le tableau Excel d'origine.
CREATE TABLE IF NOT EXISTS mouvement_vehicule (
  id_mouvement          INT AUTO_INCREMENT PRIMARY KEY,
  type_mouvement        ENUM('ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE','RETOUR_INTERNE',
                             'ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE','RESERVATION') NOT NULL,
  motif                 ENUM('LOCATION','COURSE','TRANSFERT','LAVAGE','CARBURANT','MISE_A_DISPOSITION',
                             'PRESENTATION_CLIENT','REORGANISATION_PARKING','IMPRO','GARAGE','REVISION',
                             'VISITE_TECHNIQUE','AUTRE') NULL,
  date_mouvement        DATETIME NOT NULL,               -- date + heure (départ ou retour)
  date_retour_prevue    DATETIME NULL,                   -- renseignée sur les départs
  kilometrage           INT NULL CHECK (kilometrage IS NULL OR kilometrage >= 0),
  observation           VARCHAR(255) NULL,
  contravention_constatee BOOLEAN NULL,                  -- « Contraventions commises » vérifiées au retour
  id_vehicule           INT NOT NULL,
  id_lieu               INT NULL,                        -- lieu de départ ou de retour
  id_conducteur         INT NULL,                        -- « UTILISATEUR / CONDUCTEUR »
  id_commercial         INT NULL,                        -- « Agent de vente »
  id_validateur         INT NULL,                        -- « VALIDATEUR »
  id_mouvement_depart   INT NULL UNIQUE,                 -- sur un retour : le départ correspondant
  id_location           INT NULL,
  id_passage            INT NULL,
  CONSTRAINT fk_mvt_vehicule   FOREIGN KEY (id_vehicule)         REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_mvt_lieu       FOREIGN KEY (id_lieu)             REFERENCES lieu(id_lieu),
  CONSTRAINT fk_mvt_conducteur FOREIGN KEY (id_conducteur)       REFERENCES conducteur(id_conducteur) ON DELETE SET NULL,
  CONSTRAINT fk_mvt_commercial FOREIGN KEY (id_commercial)       REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT fk_mvt_validateur FOREIGN KEY (id_validateur)       REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT fk_mvt_depart     FOREIGN KEY (id_mouvement_depart) REFERENCES mouvement_vehicule(id_mouvement),
  CONSTRAINT fk_mvt_location   FOREIGN KEY (id_location)         REFERENCES location(id_location) ON DELETE SET NULL,
  CONSTRAINT fk_mvt_passage    FOREIGN KEY (id_passage)          REFERENCES passage_garage(id_passage),
  INDEX idx_mvt_vehicule_date (id_vehicule, date_mouvement),
  INDEX idx_mvt_type (type_mouvement),
  INDEX idx_mvt_location (id_location),
  INDEX idx_mvt_passage (id_passage)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vente_vehicule (
  id_vente              INT AUTO_INCREMENT PRIMARY KEY,
  numero_vente          VARCHAR(30) NOT NULL UNIQUE,
  id_vehicule           INT NOT NULL,
  id_acheteur           INT NOT NULL,
  date_vente            DATE NOT NULL,
  prix_vente            DECIMAL(14,2) NOT NULL CHECK (prix_vente >= 0),
  devise                CHAR(3) NOT NULL DEFAULT 'XOF',
  frais_vente           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (frais_vente >= 0),
  motif_vente           ENUM('RENOUVELLEMENT_PARC','COUT_ENTRETIEN_ELEVE','FIN_CONTRAT','ACCIDENT','BESOIN_TRESORERIE','AUTRE') NOT NULL,
  etat_vehicule         ENUM('BON','MOYEN','MAUVAIS','ACCIDENTE','EPAVE','POUR_PIECES') NOT NULL,
  kilometrage_vente     INT NOT NULL CHECK (kilometrage_vente >= 0),
  canal_vente           ENUM('PARTICULIER','GARAGE_PROFESSIONNEL','ENCHERES','CLIENT_LOCATION','APPEL_OFFRES','AUTRE') NULL,
  statut_paiement       ENUM('NON_PAYEE','PARTIELLE','PAYEE') NOT NULL DEFAULT 'NON_PAYEE',
  date_remise_vehicule  DATE NULL,
  reference_cession     VARCHAR(60) NULL,
  statut                ENUM('CONCLUE','ANNULEE') NOT NULL DEFAULT 'CONCLUE',
  date_annulation       DATE NULL,
  motif_annulation      VARCHAR(255) NULL,
  id_facture            INT NULL,
  id_mouvement          INT NOT NULL UNIQUE,
  id_commercial         INT NULL,
  id_administrateur     INT NOT NULL,
  observation           VARCHAR(255) NULL,
  date_creation         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vente_vehicule FOREIGN KEY (id_vehicule) REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_vente_acheteur FOREIGN KEY (id_acheteur) REFERENCES client(id_client),
  CONSTRAINT fk_vente_facture FOREIGN KEY (id_facture) REFERENCES facture(id_facture) ON DELETE SET NULL,
  CONSTRAINT fk_vente_mouvement FOREIGN KEY (id_mouvement) REFERENCES mouvement_vehicule(id_mouvement),
  CONSTRAINT fk_vente_commercial FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT fk_vente_administrateur FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur),
  INDEX idx_vente_vehicule_date (id_vehicule, date_vente),
  INDEX idx_vente_statut (statut)
) ENGINE=InnoDB;

-- =====================================================================================
-- 9. CONTRAVENTIONS ROUTIÈRES (ANATT)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS type_contravention (
  id_type_contravention  INT AUTO_INCREMENT PRIMARY KEY,
  libelle                VARCHAR(150)  NOT NULL UNIQUE,
  montant_standard       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (montant_standard >= 0)
) ENGINE=InnoDB;

-- Une ligne = une ligne du fichier « CONTRAVENTIONS ANATT ». Les totaux de l'en-tête du fichier
-- (Totale hors frais, Payée, Reste à payer, Recouvrement attendu/effectué...) sont CALCULÉS
-- par la vue v_synthese_contraventions.
CREATE TABLE IF NOT EXISTS contravention (
  id_contravention       INT AUTO_INCREMENT PRIMARY KEY,
  numero_contravention   VARCHAR(40) NOT NULL UNIQUE,
  id_type_contravention  INT NOT NULL,
  date_infraction        DATE NOT NULL,
  montant                DECIMAL(12,2) NOT NULL CHECK (montant >= 0),   -- hors frais
  frais                  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (frais >= 0),
  devise                 CHAR(3) NOT NULL DEFAULT 'XOF',
  statut_paiement        ENUM('IMPAYEE','PAYEE') NOT NULL DEFAULT 'IMPAYEE',
  date_reglement         DATE NULL,
  moyen_paiement         ENUM('ESPECES','CARTE_BANCAIRE','CHEQUE','VIREMENT','MTN_MOMO','MOOV_MONEY','MOBILE_MONEY') NULL,
  numero_quittance       VARCHAR(60) NULL,
  payeur                 ENUM('HERTZ','CLIENT','AGENT_DE_VENTE') NULL,
  statut_recouvrement    ENUM('NON_EFFECTUE','EFFECTUE','NON_LIEU') NOT NULL DEFAULT 'NON_EFFECTUE',
  date_recouvrement      DATE NULL,
  montant_recouvre       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (montant_recouvre >= 0),
  frais_recouvres        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (frais_recouvres >= 0),
  observation            VARCHAR(255) NULL,
  id_vehicule            INT NOT NULL,
  id_client              INT NULL,
  id_conducteur          INT NULL,
  id_location            INT NULL,
  id_mouvement           INT NULL,                        -- sortie pendant laquelle l'infraction a eu lieu
  id_commercial          INT NULL,                        -- « Agent de vente »
  CONSTRAINT fk_contrav_type       FOREIGN KEY (id_type_contravention) REFERENCES type_contravention(id_type_contravention),
  CONSTRAINT fk_contrav_vehicule   FOREIGN KEY (id_vehicule)   REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_contrav_client     FOREIGN KEY (id_client)     REFERENCES client(id_client) ON DELETE SET NULL,
  CONSTRAINT fk_contrav_conducteur FOREIGN KEY (id_conducteur) REFERENCES conducteur(id_conducteur) ON DELETE SET NULL,
  CONSTRAINT fk_contrav_location   FOREIGN KEY (id_location)   REFERENCES location(id_location) ON DELETE SET NULL,
  CONSTRAINT fk_contrav_mouvement  FOREIGN KEY (id_mouvement)  REFERENCES mouvement_vehicule(id_mouvement) ON DELETE SET NULL,
  CONSTRAINT fk_contrav_commercial FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT ck_contrav_reglement CHECK (statut_paiement = 'IMPAYEE' OR date_reglement IS NOT NULL),
  INDEX idx_contrav_vehicule (id_vehicule, date_infraction),
  INDEX idx_contrav_statut (statut_paiement, statut_recouvrement),
  INDEX idx_contrav_client (id_client)
) ENGINE=InnoDB;

-- =====================================================================================
-- 10. DOCUMENTS ET RAPPORTS
-- =====================================================================================

CREATE TABLE IF NOT EXISTS rapport (
  id_rapport         INT AUTO_INCREMENT PRIMARY KEY,
  type_rapport       ENUM('CHIFFRE_AFFAIRES','TAUX_UTILISATION','TAUX_ROTATION','PERFORMANCE_COMMERCIAUX',
                          'STATISTIQUES_LOCATIONS','STATISTIQUES_RESERVATIONS','AFFAIRES_PERDUES',
                          'CONTRAVENTIONS','MAINTENANCE','GLOBAL') NOT NULL,
  periode_debut      DATE NOT NULL,
  periode_fin        DATE NOT NULL,
  format_export      ENUM('PDF','XLSX','CSV','IMPRESSION') NOT NULL DEFAULT 'PDF',
  date_generation    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_commercial      INT NULL,                           -- rapport centré sur un commercial (évaluation)
  id_administrateur  INT NOT NULL,
  CONSTRAINT fk_rapport_commercial FOREIGN KEY (id_commercial)     REFERENCES commercial(id_commercial) ON DELETE SET NULL,
  CONSTRAINT fk_rapport_admin      FOREIGN KEY (id_administrateur) REFERENCES administrateur(id_administrateur),
  CONSTRAINT ck_rapport_periode CHECK (periode_fin >= periode_debut)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document (
  id_document      INT AUTO_INCREMENT PRIMARY KEY,
  type_document    ENUM('FICHE_CLIENT','PROFORMA','BON_COMMANDE','CONTRAT','ETAT_DES_LIEUX','FACTURE','RECU',
                        'FICHE_CONTRAVENTION','RAPPORT') NOT NULL,
  date_generation  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  chemin_fichier   VARCHAR(255) NOT NULL,
  id_client        INT NULL,
  id_reservation   INT NULL,
  id_location      INT NULL,
  id_facture       INT NULL,
  id_contravention INT NULL,
  id_rapport       INT NULL,
  CONSTRAINT fk_doc_client   FOREIGN KEY (id_client)        REFERENCES client(id_client),
  CONSTRAINT fk_doc_resa     FOREIGN KEY (id_reservation)   REFERENCES reservation(id_reservation),
  CONSTRAINT fk_doc_loc      FOREIGN KEY (id_location)      REFERENCES location(id_location),
  CONSTRAINT fk_doc_fact     FOREIGN KEY (id_facture)       REFERENCES facture(id_facture),
  CONSTRAINT fk_doc_contrav  FOREIGN KEY (id_contravention) REFERENCES contravention(id_contravention),
  CONSTRAINT fk_doc_rapport  FOREIGN KEY (id_rapport)       REFERENCES rapport(id_rapport),
  CONSTRAINT ck_doc_rattache CHECK (id_client IS NOT NULL OR id_reservation IS NOT NULL OR id_location IS NOT NULL
                                    OR id_facture IS NOT NULL OR id_contravention IS NOT NULL OR id_rapport IS NOT NULL),
  INDEX idx_doc_type (type_document, date_generation)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;