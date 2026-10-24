-- =====================================================================================
--  BASE DE DONNÉES : GESTION DES ACTIVITÉS DE LOCATION DE VÉHICULES (HERTZ BÉNIN)
--  SGBD cible : MySQL 8.0+ / MariaDB 10.5+   (InnoDB, utf8mb4)      Version 2
--
--  Conçue à partir :
--    1. des fonctionnalités du cahier des charges (clients, commerciaux, réservations,
--       locations courte/longue durée, mouvements, statistiques, documents, garage) ;
--    2. des fichiers historiques Hertz :
--         CSV  Journal des mouvements (Journal) -> mouvement_vehicule, lieu, conducteur
--         CSV  Journal des mouvements (RESA)    -> reservation, client, suivi_reservation
--         CSV  Journal des mouvements (Affaires perdues) -> affaire_perdue, relance
--         CSV  CONTRAVENTIONS ANATT             -> contravention, type_contravention
--         XLSX Liste des agents de vente        -> agence, commercial
--         XLSX Location (suivi mensuel)         -> location, facture, ligne_facture, paiement,
--                                                  prolongation_location, option_location
--         XLSX PARC_LCD (Liste globale + LCD)   -> vehicule, modele_vehicule, centre, sinistre
--  Devise par défaut : XOF (franc CFA). Dates au format SQL (AAAA-MM-JJ).
--
--  CONTENU
--    1. Tables de référence          7. Maintenance (garage, réparations, sinistres)
--    2. Acteurs                      8. Journal des mouvements
--    3. Parc de véhicules            9. Contraventions ANATT
--    4. Réservations, affaires      10. Documents et rapports
--       perdues                     11. Triggers (règles automatiques)
--    5. Locations (courte/longue)   12. Vues (dont indicateurs KPI)   13. Procédures   14. Données de référence
--    6. Facturation et paiements
-- =====================================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS gestion_location_hertz
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gestion_location_hertz;

-- =====================================================================================
-- 1. TABLES DE RÉFÉRENCE
-- =====================================================================================

-- Agences (fichier « Liste des agents de vente » : Agence principale APS, Aéroport AEP, Golden Tulip AGT)
CREATE TABLE agence (
  id_agence  INT AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(10)  NOT NULL UNIQUE,
  nom        VARCHAR(100) NOT NULL UNIQUE,
  adresse    VARCHAR(255) NULL,
  telephone  VARCHAR(30)  NULL,
  actif      BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- Lieux de départ / retour (remplace les adresses saisies à la main dans le journal :
-- « DIRECTION HERTZ », « Direction Hertz », « DIRECETION HERTZ », « Golden tulip »...)
CREATE TABLE lieu (
  id_lieu     INT AUTO_INCREMENT PRIMARY KEY,
  libelle     VARCHAR(120) NOT NULL UNIQUE,
  type_lieu   ENUM('AGENCE','AEROPORT','HOTEL','GARAGE','CLIENT','AUTRE') NOT NULL DEFAULT 'AUTRE',
  adresse     VARCHAR(255) NULL,
  ville       VARCHAR(80)  NULL,
  id_agence   INT NULL,
  CONSTRAINT fk_lieu_agence FOREIGN KEY (id_agence) REFERENCES agence(id_agence) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE categorie_vehicule (
  id_categorie      INT AUTO_INCREMENT PRIMARY KEY,
  libelle           VARCHAR(80)   NOT NULL UNIQUE,
  tarif_journalier  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tarif_journalier >= 0),
  tarif_mensuel     DECIMAL(12,2) NULL CHECK (tarif_mensuel IS NULL OR tarif_mensuel >= 0)
) ENGINE=InnoDB;

-- Liste fermée des modèles : empêche les fautes de frappe du fichier parc
-- (KIKS, HRDBODY, HARBODY, SOPPORTER, COROLA CROSS...). Les finitions vont dans vehicule.version.
CREATE TABLE modele_vehicule (
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
CREATE TABLE calendrier (
  jour         DATE PRIMARY KEY,
  annee        SMALLINT GENERATED ALWAYS AS (YEAR(jour)) STORED,
  mois         TINYINT  GENERATED ALWAYS AS (MONTH(jour)) STORED,
  annee_mois   CHAR(7)  GENERATED ALWAYS AS (CONCAT(YEAR(jour), '-', LPAD(MONTH(jour), 2, '0'))) STORED,
  semaine_iso  INT      GENERATED ALWAYS AS (YEARWEEK(jour, 3)) STORED,
  est_weekend  BOOLEAN  GENERATED ALWAYS AS (WEEKDAY(jour) >= 5) STORED
) ENGINE=InnoDB;

-- Motifs pour lesquels une réservation ou une affaire n'a pas abouti
CREATE TABLE motif_non_aboutissement (
  id_motif  INT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(40)  NOT NULL UNIQUE,
  libelle   VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

-- =====================================================================================
-- 2. ACTEURS
-- =====================================================================================

CREATE TABLE administrateur (
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
CREATE TABLE commercial (
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
CREATE TABLE client (
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
CREATE TABLE conducteur (
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
CREATE TABLE centre (
  id_centre    INT AUTO_INCREMENT PRIMARY KEY,
  nom          VARCHAR(120) NOT NULL UNIQUE,
  type_centre  ENUM('SOCIETE','CLIENT','PERSONNE','AUTRE') NOT NULL DEFAULT 'AUTRE',
  id_client    INT NULL,
  CONSTRAINT fk_centre_client FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE vehicule (
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
  prix_vente         DECIMAL(14,2) NULL CHECK (prix_vente IS NULL OR prix_vente >= 0),
  statut             ENUM('DISPONIBLE','LOUE','EN_SORTIE','AU_GARAGE','IMMOBILISE','VENDU') NOT NULL DEFAULT 'DISPONIBLE',
  date_prochaine_visite_technique DATE NULL,
  date_expiration_assurance       DATE NULL,
  observation        VARCHAR(255) NULL,               -- « Observations particulières » (ex. Utilisé par le DAF)
  id_categorie       INT NOT NULL,
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
CREATE TABLE reservation (
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
CREATE TABLE suivi_reservation (
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
CREATE TABLE affaire_perdue (
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
CREATE TABLE relance (
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

CREATE TABLE location (
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
  statut              ENUM('EN_COURS','TERMINEE','EN_RETARD') NOT NULL DEFAULT 'EN_COURS',
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

CREATE TABLE location_courte_duree (
  id_location               INT PRIMARY KEY,           -- PK + FK vers location
  nb_jours                  INT NOT NULL CHECK (nb_jours > 0),
  tarif_journalier_applique DECIMAL(12,2) NOT NULL CHECK (tarif_journalier_applique >= 0),
  km_inclus                 INT NULL,
  supplement_km             DECIMAL(10,2) NULL,
  weekends_exclus           BOOLEAN NOT NULL DEFAULT FALSE,   -- « les week-ends ne sont pas dedans »
  CONSTRAINT fk_lcd_location FOREIGN KEY (id_location) REFERENCES location(id_location) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE location_longue_duree (
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
CREATE TABLE prolongation_location (
  id_prolongation        INT AUTO_INCREMENT PRIMARY KEY,
  id_location            INT NOT NULL,
  ancienne_date_fin      DATETIME NULL,                -- remplie par trigger
  nouvelle_date_fin      DATETIME NOT NULL,
  date_demande           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motif                  VARCHAR(255) NULL,
  montant_supplementaire DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (montant_supplementaire >= 0),
  id_commercial          INT NULL,
  CONSTRAINT fk_prolong_location   FOREIGN KEY (id_location)   REFERENCES location(id_location) ON DELETE CASCADE,
  CONSTRAINT fk_prolong_commercial FOREIGN KEY (id_commercial) REFERENCES commercial(id_commercial) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Prestations complémentaires d'une location (assurance vendue, carburant, surclassement, chauffeur...)
CREATE TABLE option_location (
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
CREATE TABLE facture (
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

CREATE TABLE ligne_facture (
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
CREATE TABLE paiement (
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

CREATE TABLE garage (
  id_garage   INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(120) NOT NULL,
  adresse     VARCHAR(255) NULL,
  telephone   VARCHAR(30)  NULL
) ENGINE=InnoDB;

CREATE TABLE passage_garage (
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
  CONSTRAINT fk_pg_vehicule FOREIGN KEY (id_vehicule) REFERENCES vehicule(id_vehicule),
  CONSTRAINT fk_pg_garage   FOREIGN KEY (id_garage)   REFERENCES garage(id_garage),
  CONSTRAINT fk_pg_remplace FOREIGN KEY (id_vehicule_remplacement) REFERENCES vehicule(id_vehicule),
  CONSTRAINT ck_pg_remplace CHECK (id_vehicule_remplacement IS NULL OR id_vehicule_remplacement <> id_vehicule),
  CONSTRAINT ck_pg_dates    CHECK (date_sortie_prevue IS NULL OR date_sortie_prevue >= date_entree),
  CONSTRAINT ck_pg_sortie   CHECK (date_sortie_reelle IS NULL OR date_sortie_reelle >= date_entree),
  INDEX idx_pg_vehicule (id_vehicule, date_entree)
) ENGINE=InnoDB;

CREATE TABLE reparation (
  id_reparation    INT AUTO_INCREMENT PRIMARY KEY,
  description      VARCHAR(255) NOT NULL,
  date_reparation  DATE NOT NULL,
  cout             DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cout >= 0),
  id_passage       INT NOT NULL,
  CONSTRAINT fk_rep_passage FOREIGN KEY (id_passage) REFERENCES passage_garage(id_passage) ON DELETE CASCADE,
  INDEX idx_rep_passage (id_passage)
) ENGINE=InnoDB;

-- Accidents, épaves, pannes graves (« accidenté 24/07/2026 », « epave » dans le fichier parc)
CREATE TABLE sinistre (
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
CREATE TABLE mouvement_vehicule (
  id_mouvement          INT AUTO_INCREMENT PRIMARY KEY,
  type_mouvement        ENUM('ENTREE_PARC','MISE_EN_LOCATION','RETOUR_LOCATION','SORTIE_INTERNE','RETOUR_INTERNE',
                             'ENVOI_GARAGE','RETOUR_GARAGE','SORTIE_DEFINITIVE') NOT NULL,
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
  CONSTRAINT fk_mvt_location   FOREIGN KEY (id_location)         REFERENCES location(id_location),
  CONSTRAINT fk_mvt_passage    FOREIGN KEY (id_passage)          REFERENCES passage_garage(id_passage),
  INDEX idx_mvt_vehicule_date (id_vehicule, date_mouvement),
  INDEX idx_mvt_type (type_mouvement),
  INDEX idx_mvt_location (id_location),
  INDEX idx_mvt_passage (id_passage)
) ENGINE=InnoDB;

-- =====================================================================================
-- 9. CONTRAVENTIONS ROUTIÈRES (ANATT)
-- =====================================================================================

CREATE TABLE type_contravention (
  id_type_contravention  INT AUTO_INCREMENT PRIMARY KEY,
  libelle                VARCHAR(150)  NOT NULL UNIQUE,
  montant_standard       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (montant_standard >= 0)
) ENGINE=InnoDB;

-- Une ligne = une ligne du fichier « CONTRAVENTIONS ANATT ». Les totaux de l'en-tête du fichier
-- (Totale hors frais, Payée, Reste à payer, Recouvrement attendu/effectué...) sont CALCULÉS
-- par la vue v_synthese_contraventions.
CREATE TABLE contravention (
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

CREATE TABLE rapport (
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

CREATE TABLE document (
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

-- =====================================================================================
-- 11. TRIGGERS : RÈGLES MÉTIER AUTOMATIQUES
-- =====================================================================================
-- Pour importer un HISTORIQUE (ex. les anciens CSV) sans déclencher les contrôles de statut
-- ni les mouvements automatiques :   SET @import_historique = 1;   ... imports ...
-- puis :  SET @import_historique = 0;  CALL sp_recalculer_statuts_vehicules();

DELIMITER //

-- ---- Réservations : agence par défaut + historisation des changements de statut ----------
CREATE TRIGGER trg_reservation_bi BEFORE INSERT ON reservation FOR EACH ROW
BEGIN
  IF NEW.id_agence IS NULL THEN
    SET NEW.id_agence = (SELECT id_agence FROM commercial WHERE id_commercial = NEW.id_commercial);
  END IF;
END//

CREATE TRIGGER trg_reservation_ai AFTER INSERT ON reservation FOR EACH ROW
BEGIN
  INSERT INTO suivi_reservation (ancien_statut, nouveau_statut, id_reservation, commentaire)
  VALUES (NULL, NEW.statut, NEW.id_reservation, 'Création de la réservation');
END//

CREATE TRIGGER trg_reservation_au AFTER UPDATE ON reservation FOR EACH ROW
BEGIN
  IF OLD.statut <> NEW.statut THEN
    INSERT INTO suivi_reservation (ancien_statut, nouveau_statut, id_reservation)
    VALUES (OLD.statut, NEW.statut, NEW.id_reservation);
  END IF;
END//

-- ---- Locations : cohérence avec la réservation, anti-chevauchement -------------------
CREATE TRIGGER trg_location_bi BEFORE INSERT ON location FOR EACH ROW
BEGIN
  DECLARE v_client INT; DECLARE v_vehicule INT;
  IF NEW.date_retour_reelle IS NOT NULL THEN
    SET NEW.statut = 'TERMINEE';
  END IF;
  IF NEW.id_agence IS NULL THEN
    SET NEW.id_agence = (SELECT id_agence FROM commercial WHERE id_commercial = NEW.id_commercial);
  END IF;
  IF NEW.id_reservation IS NOT NULL THEN
    SELECT id_client, id_vehicule INTO v_client, v_vehicule
      FROM reservation WHERE id_reservation = NEW.id_reservation;
    IF v_client <> NEW.id_client OR v_vehicule <> NEW.id_vehicule THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Location incohérente : client ou véhicule différent de la réservation.';
    END IF;
  END IF;
  IF COALESCE(@import_historique, 0) = 0 THEN
    IF EXISTS (SELECT 1 FROM location l
                WHERE l.id_vehicule = NEW.id_vehicule
                  AND l.statut IN ('EN_COURS','EN_RETARD')
                  AND l.date_debut < NEW.date_fin_prevue
                  AND COALESCE(l.date_retour_reelle, l.date_fin_prevue) > NEW.date_debut) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Ce véhicule est déjà en location sur cette période.';
    END IF;
  END IF;
END//

CREATE TRIGGER trg_location_ai AFTER INSERT ON location FOR EACH ROW
BEGIN
  IF NEW.id_reservation IS NOT NULL THEN
    UPDATE reservation SET statut = 'TRANSFORMEE_EN_LOCATION' WHERE id_reservation = NEW.id_reservation;
  END IF;
  IF COALESCE(@import_historique, 0) = 0 THEN
    INSERT INTO mouvement_vehicule (type_mouvement, motif, date_mouvement, date_retour_prevue, kilometrage,
                                    id_vehicule, id_lieu, id_conducteur, id_commercial, id_validateur, id_location)
    VALUES ('MISE_EN_LOCATION', 'LOCATION', NEW.date_debut, NEW.date_fin_prevue, NEW.km_depart,
            NEW.id_vehicule, NEW.id_lieu_depart, NEW.id_conducteur, NEW.id_commercial, NEW.id_commercial, NEW.id_location);
  END IF;
END//

CREATE TRIGGER trg_location_bu BEFORE UPDATE ON location FOR EACH ROW
BEGIN
  IF OLD.date_retour_reelle IS NULL AND NEW.date_retour_reelle IS NOT NULL THEN
    SET NEW.statut = 'TERMINEE';
  END IF;
END//

CREATE TRIGGER trg_location_au AFTER UPDATE ON location FOR EACH ROW
BEGIN
  DECLARE v_depart INT;
  IF OLD.date_retour_reelle IS NULL AND NEW.date_retour_reelle IS NOT NULL
     AND COALESCE(@import_historique, 0) = 0 THEN
    SELECT id_mouvement INTO v_depart FROM mouvement_vehicule
     WHERE id_location = NEW.id_location AND type_mouvement = 'MISE_EN_LOCATION' LIMIT 1;
    INSERT INTO mouvement_vehicule (type_mouvement, motif, date_mouvement, kilometrage, id_vehicule, id_lieu,
                                    id_conducteur, id_commercial, id_mouvement_depart, id_location)
    VALUES ('RETOUR_LOCATION', 'LOCATION', NEW.date_retour_reelle, NEW.km_retour, NEW.id_vehicule,
            COALESCE(NEW.id_lieu_retour, NEW.id_lieu_depart), NEW.id_conducteur, NEW.id_commercial, v_depart, NEW.id_location);
  END IF;
END//

-- ---- Sous-types de location : le type doit correspondre -------------------------------
CREATE TRIGGER trg_lcd_bi BEFORE INSERT ON location_courte_duree FOR EACH ROW
BEGIN
  IF (SELECT type_location FROM location WHERE id_location = NEW.id_location) <> 'COURTE_DUREE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cette location n''est pas de type COURTE_DUREE.';
  END IF;
END//

CREATE TRIGGER trg_lld_bi BEFORE INSERT ON location_longue_duree FOR EACH ROW
BEGIN
  IF (SELECT type_location FROM location WHERE id_location = NEW.id_location) <> 'LONGUE_DUREE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cette location n''est pas de type LONGUE_DUREE.';
  END IF;
END//

-- ---- Mouvements : contrôles puis mise à jour de la situation du véhicule -------------
CREATE TRIGGER trg_mouvement_bi BEFORE INSERT ON mouvement_vehicule FOR EACH ROW
BEGIN
  DECLARE v_statut VARCHAR(20);
  DECLARE v_type_dep VARCHAR(30); DECLARE v_veh_dep INT; DECLARE v_km_dep INT; DECLARE v_date_dep DATETIME;
  IF COALESCE(@import_historique, 0) = 0 THEN
    IF NEW.type_mouvement IN ('MISE_EN_LOCATION','SORTIE_INTERNE','ENVOI_GARAGE','SORTIE_DEFINITIVE') THEN
      SELECT statut INTO v_statut FROM vehicule WHERE id_vehicule = NEW.id_vehicule;
      IF v_statut <> 'DISPONIBLE' AND NOT (NEW.type_mouvement = 'ENVOI_GARAGE' AND v_statut = 'IMMOBILISE') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mouvement impossible : le véhicule n''est pas disponible.';
      END IF;
    ELSEIF NEW.type_mouvement IN ('RETOUR_LOCATION','RETOUR_INTERNE','RETOUR_GARAGE') THEN
      IF NEW.id_mouvement_depart IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un retour doit référencer le départ correspondant.';
      END IF;
      SELECT type_mouvement, id_vehicule, kilometrage, date_mouvement
        INTO v_type_dep, v_veh_dep, v_km_dep, v_date_dep
        FROM mouvement_vehicule WHERE id_mouvement = NEW.id_mouvement_depart;
      IF v_veh_dep <> NEW.id_vehicule THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le retour ne concerne pas le même véhicule que le départ.';
      END IF;
      IF NOT ((NEW.type_mouvement = 'RETOUR_LOCATION' AND v_type_dep = 'MISE_EN_LOCATION')
           OR (NEW.type_mouvement = 'RETOUR_INTERNE'  AND v_type_dep = 'SORTIE_INTERNE')
           OR (NEW.type_mouvement = 'RETOUR_GARAGE'   AND v_type_dep = 'ENVOI_GARAGE')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le type de retour ne correspond pas au type de départ.';
      END IF;
      IF NEW.date_mouvement < v_date_dep THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La date de retour est antérieure à la date de départ.';
      END IF;
      IF NEW.kilometrage IS NOT NULL AND v_km_dep IS NOT NULL AND NEW.kilometrage < v_km_dep THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le kilométrage de retour est inférieur au kilométrage de départ.';
      END IF;
    END IF;
  END IF;
END//

CREATE TRIGGER trg_mouvement_ai AFTER INSERT ON mouvement_vehicule FOR EACH ROW
BEGIN
  IF COALESCE(@import_historique, 0) = 0 THEN
    UPDATE vehicule
       SET statut = CASE NEW.type_mouvement
                      WHEN 'ENTREE_PARC'       THEN 'DISPONIBLE'
                      WHEN 'MISE_EN_LOCATION'  THEN 'LOUE'
                      WHEN 'SORTIE_INTERNE'    THEN 'EN_SORTIE'
                      WHEN 'ENVOI_GARAGE'      THEN 'AU_GARAGE'
                      WHEN 'SORTIE_DEFINITIVE' THEN 'VENDU'
                      WHEN 'RETOUR_GARAGE'     THEN 'DISPONIBLE'
                      ELSE CASE WHEN EXISTS (SELECT 1 FROM sinistre s WHERE s.id_vehicule = NEW.id_vehicule
                                              AND s.immobilisant = 1 AND s.statut <> 'CLOS')
                                THEN 'IMMOBILISE' ELSE 'DISPONIBLE' END   -- retour de location / sortie interne
                    END,
           kilometrage = GREATEST(kilometrage, COALESCE(NEW.kilometrage, 0)),
           date_sortie_parc = CASE WHEN NEW.type_mouvement = 'SORTIE_DEFINITIVE'
                                   THEN DATE(NEW.date_mouvement) ELSE date_sortie_parc END
     WHERE id_vehicule = NEW.id_vehicule;
  END IF;
END//

-- ---- Facturation / paiements -----------------------------------------------------------
-- Le montant HT d'une facture = somme de ses lignes
CREATE TRIGGER trg_ligne_facture_ai AFTER INSERT ON ligne_facture FOR EACH ROW
BEGIN
  UPDATE facture SET montant_ht = (SELECT COALESCE(SUM(montant_ht), 0) FROM ligne_facture WHERE id_facture = NEW.id_facture)
   WHERE id_facture = NEW.id_facture;
  IF NEW.id_location IS NOT NULL THEN
    UPDATE reservation SET statut_facturation = 'FACTURE_EMISE_PAIEMENT_EN_ATTENTE'
     WHERE id_reservation = (SELECT id_reservation FROM location WHERE id_location = NEW.id_location)
       AND statut_facturation IN ('NON_FACTUREE','EN_ATTENTE_BON_COMMANDE');
  END IF;
END//

CREATE TRIGGER trg_ligne_facture_au AFTER UPDATE ON ligne_facture FOR EACH ROW
BEGIN
  UPDATE facture SET montant_ht = (SELECT COALESCE(SUM(montant_ht), 0) FROM ligne_facture WHERE id_facture = NEW.id_facture)
   WHERE id_facture = NEW.id_facture;
  IF OLD.id_facture <> NEW.id_facture THEN
    UPDATE facture SET montant_ht = (SELECT COALESCE(SUM(montant_ht), 0) FROM ligne_facture WHERE id_facture = OLD.id_facture)
     WHERE id_facture = OLD.id_facture;
  END IF;
END//

CREATE TRIGGER trg_ligne_facture_ad AFTER DELETE ON ligne_facture FOR EACH ROW
BEGIN
  UPDATE facture SET montant_ht = (SELECT COALESCE(SUM(montant_ht), 0) FROM ligne_facture WHERE id_facture = OLD.id_facture)
   WHERE id_facture = OLD.id_facture;
END//

-- Quand une facture change de statut de paiement, ses locations et réservations suivent
CREATE TRIGGER trg_facture_au AFTER UPDATE ON facture FOR EACH ROW
BEGIN
  IF OLD.statut_paiement <> NEW.statut_paiement THEN
    UPDATE location l JOIN ligne_facture lf ON lf.id_location = l.id_location
       SET l.statut_paiement = NEW.statut_paiement
     WHERE lf.id_facture = NEW.id_facture;
    IF NEW.statut_paiement = 'PAYEE' THEN
      UPDATE reservation r
        JOIN location l ON l.id_reservation = r.id_reservation
        JOIN ligne_facture lf ON lf.id_location = l.id_location
         SET r.statut_facturation = 'PAIEMENT_EFFECTUE', r.statut_paiement = 'PAYEE'
       WHERE lf.id_facture = NEW.id_facture;
    END IF;
  END IF;
END//

CREATE TRIGGER trg_paiement_ai AFTER INSERT ON paiement FOR EACH ROW
BEGIN
  DECLARE v_total DECIMAL(14,2); DECLARE v_du DECIMAL(14,2);
  IF NEW.id_facture IS NOT NULL THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_total FROM paiement WHERE id_facture = NEW.id_facture;
    SELECT montant_ttc INTO v_du FROM facture WHERE id_facture = NEW.id_facture;
    UPDATE facture
       SET statut_paiement = CASE WHEN v_total >= v_du THEN 'PAYEE' WHEN v_total > 0 THEN 'PARTIELLE' ELSE 'NON_PAYEE' END
     WHERE id_facture = NEW.id_facture;
  END IF;
  IF NEW.id_reservation IS NOT NULL THEN
    UPDATE reservation SET statut_paiement = 'PAYEE' WHERE id_reservation = NEW.id_reservation;
  END IF;
  IF NEW.id_location IS NOT NULL THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_total FROM paiement WHERE id_location = NEW.id_location;
    SELECT montant_total INTO v_du FROM location WHERE id_location = NEW.id_location;
    UPDATE location SET statut_paiement = CASE WHEN v_total >= v_du THEN 'PAYEE' ELSE 'PARTIELLE' END
     WHERE id_location = NEW.id_location;
  END IF;
END//

-- ---- Prolongations de location ---------------------------------------------------------------
CREATE TRIGGER trg_prolongation_bi BEFORE INSERT ON prolongation_location FOR EACH ROW
BEGIN
  DECLARE v_fin DATETIME; DECLARE v_veh INT; DECLARE v_statut VARCHAR(15); DECLARE v_rendue DATETIME;
  SELECT date_fin_prevue, id_vehicule, statut, date_retour_reelle INTO v_fin, v_veh, v_statut, v_rendue
    FROM location WHERE id_location = NEW.id_location;
  IF v_statut = 'TERMINEE' OR v_rendue IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Impossible de prolonger une location terminée.';
  END IF;
  IF NEW.nouvelle_date_fin <= v_fin THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La nouvelle date de fin doit être postérieure à la date de fin actuelle.';
  END IF;
  IF COALESCE(@import_historique, 0) = 0 AND EXISTS (
       SELECT 1 FROM location l
        WHERE l.id_vehicule = v_veh AND l.id_location <> NEW.id_location
          AND l.statut IN ('EN_COURS','EN_RETARD')
          AND l.date_debut < NEW.nouvelle_date_fin
          AND COALESCE(l.date_retour_reelle, l.date_fin_prevue) > v_fin) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prolongation impossible : le véhicule est déjà engagé sur cette période.';
  END IF;
  SET NEW.ancienne_date_fin = v_fin;
END//

CREATE TRIGGER trg_prolongation_ai AFTER INSERT ON prolongation_location FOR EACH ROW
BEGIN
  UPDATE location
     SET date_fin_prevue = NEW.nouvelle_date_fin,
         montant_total   = montant_total + NEW.montant_supplementaire,
         statut          = CASE WHEN statut = 'EN_RETARD' AND NEW.nouvelle_date_fin >= NOW() THEN 'EN_COURS' ELSE statut END
   WHERE id_location = NEW.id_location;
END//

-- ---- Sinistres : immobilisation automatique du véhicule ----------------------------------------
CREATE TRIGGER trg_sinistre_bu BEFORE UPDATE ON sinistre FOR EACH ROW
BEGIN
  IF NEW.statut = 'CLOS' AND NEW.date_cloture IS NULL THEN
    SET NEW.date_cloture = CURRENT_DATE;
  END IF;
END//

CREATE TRIGGER trg_sinistre_ai AFTER INSERT ON sinistre FOR EACH ROW
BEGIN
  IF NEW.immobilisant = 1 AND NEW.statut <> 'CLOS' AND COALESCE(@import_historique, 0) = 0 THEN
    UPDATE vehicule SET statut = 'IMMOBILISE'
     WHERE id_vehicule = NEW.id_vehicule AND statut IN ('DISPONIBLE','EN_SORTIE');
  END IF;
END//

CREATE TRIGGER trg_sinistre_au AFTER UPDATE ON sinistre FOR EACH ROW
BEGIN
  IF NEW.statut = 'CLOS' AND OLD.statut <> 'CLOS' AND COALESCE(@import_historique, 0) = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM sinistre s WHERE s.id_vehicule = NEW.id_vehicule
                    AND s.immobilisant = 1 AND s.statut <> 'CLOS') THEN
      UPDATE vehicule SET statut = 'DISPONIBLE' WHERE id_vehicule = NEW.id_vehicule AND statut = 'IMMOBILISE';
    END IF;
  END IF;
END//

-- ---- Maintenance : mouvements automatiques + total des réparations ---------------------
CREATE TRIGGER trg_passage_ai AFTER INSERT ON passage_garage FOR EACH ROW
BEGIN
  IF COALESCE(@import_historique, 0) = 0 THEN
    INSERT INTO mouvement_vehicule (type_mouvement, motif, date_mouvement, kilometrage, id_vehicule, id_passage, observation)
    VALUES ('ENVOI_GARAGE',
            CASE NEW.type_passage WHEN 'REVISION' THEN 'REVISION' WHEN 'ENTRETIEN' THEN 'REVISION'
                                  WHEN 'VISITE_TECHNIQUE' THEN 'VISITE_TECHNIQUE' ELSE 'GARAGE' END,
            CAST(NEW.date_entree AS DATETIME), NEW.km_entree, NEW.id_vehicule, NEW.id_passage, NEW.motif);
  END IF;
END//

CREATE TRIGGER trg_passage_bu BEFORE UPDATE ON passage_garage FOR EACH ROW
BEGIN
  IF OLD.date_sortie_reelle IS NULL AND NEW.date_sortie_reelle IS NOT NULL THEN
    SET NEW.statut = 'TERMINEE';
  END IF;
END//

CREATE TRIGGER trg_passage_au AFTER UPDATE ON passage_garage FOR EACH ROW
BEGIN
  DECLARE v_depart INT;
  IF OLD.date_sortie_reelle IS NULL AND NEW.date_sortie_reelle IS NOT NULL
     AND COALESCE(@import_historique, 0) = 0 THEN
    SELECT id_mouvement INTO v_depart FROM mouvement_vehicule
     WHERE id_passage = NEW.id_passage AND type_mouvement = 'ENVOI_GARAGE' LIMIT 1;
    INSERT INTO mouvement_vehicule (type_mouvement, motif, date_mouvement, id_vehicule, id_passage, id_mouvement_depart)
    VALUES ('RETOUR_GARAGE', 'GARAGE', CAST(NEW.date_sortie_reelle AS DATETIME), NEW.id_vehicule, NEW.id_passage, v_depart);
    -- la réparation est terminée : les sinistres rattachés à ce passage sont clos (fin de l'immobilisation)
    UPDATE sinistre SET statut = 'CLOS', date_cloture = NEW.date_sortie_reelle
     WHERE id_passage = NEW.id_passage AND statut <> 'CLOS';
  END IF;
END//

CREATE TRIGGER trg_reparation_ai AFTER INSERT ON reparation FOR EACH ROW
BEGIN
  UPDATE passage_garage SET cout_total = (SELECT COALESCE(SUM(cout), 0) FROM reparation WHERE id_passage = NEW.id_passage)
   WHERE id_passage = NEW.id_passage;
END//

CREATE TRIGGER trg_reparation_au AFTER UPDATE ON reparation FOR EACH ROW
BEGIN
  UPDATE passage_garage SET cout_total = (SELECT COALESCE(SUM(cout), 0) FROM reparation WHERE id_passage = NEW.id_passage)
   WHERE id_passage = NEW.id_passage;
  IF OLD.id_passage <> NEW.id_passage THEN
    UPDATE passage_garage SET cout_total = (SELECT COALESCE(SUM(cout), 0) FROM reparation WHERE id_passage = OLD.id_passage)
     WHERE id_passage = OLD.id_passage;
  END IF;
END//

CREATE TRIGGER trg_reparation_ad AFTER DELETE ON reparation FOR EACH ROW
BEGIN
  UPDATE passage_garage SET cout_total = (SELECT COALESCE(SUM(cout), 0) FROM reparation WHERE id_passage = OLD.id_passage)
   WHERE id_passage = OLD.id_passage;
END//

-- ---- Contraventions : rattachement automatique à la location / au client -------------
-- À l'enregistrement, on retrouve la location (et donc le client, le commercial, le conducteur)
-- qui avait le véhicule à la date de l'infraction, ainsi que la sortie correspondante au journal.
CREATE TRIGGER trg_contravention_bi BEFORE INSERT ON contravention FOR EACH ROW
BEGIN
  DECLARE v_loc INT DEFAULT NULL; DECLARE v_cli INT DEFAULT NULL;
  DECLARE v_com INT DEFAULT NULL; DECLARE v_cond INT DEFAULT NULL; DECLARE v_mvt INT DEFAULT NULL;
  IF NEW.id_location IS NULL THEN
    SELECT l.id_location, l.id_client, l.id_commercial, l.id_conducteur
      INTO v_loc, v_cli, v_com, v_cond
      FROM location l
     WHERE l.id_vehicule = NEW.id_vehicule
       AND NEW.date_infraction >= DATE(l.date_debut)
       AND NEW.date_infraction <= DATE(COALESCE(l.date_retour_reelle, l.date_fin_prevue))
     ORDER BY l.date_debut DESC LIMIT 1;
    SET NEW.id_location = v_loc;
    IF NEW.id_client      IS NULL THEN SET NEW.id_client      = v_cli;  END IF;
    IF NEW.id_commercial  IS NULL THEN SET NEW.id_commercial  = v_com;  END IF;
    IF NEW.id_conducteur  IS NULL THEN SET NEW.id_conducteur  = v_cond; END IF;
  END IF;
  IF NEW.id_mouvement IS NULL THEN
    SELECT d.id_mouvement INTO v_mvt
      FROM mouvement_vehicule d
      LEFT JOIN mouvement_vehicule r ON r.id_mouvement_depart = d.id_mouvement
     WHERE d.id_vehicule = NEW.id_vehicule
       AND d.type_mouvement IN ('MISE_EN_LOCATION','SORTIE_INTERNE','ENVOI_GARAGE')
       AND DATE(d.date_mouvement) <= NEW.date_infraction
       AND (r.id_mouvement IS NULL OR DATE(r.date_mouvement) >= NEW.date_infraction)
     ORDER BY d.date_mouvement DESC LIMIT 1;
    SET NEW.id_mouvement = v_mvt;
  END IF;
END//

DELIMITER ;

-- =====================================================================================
-- 12. VUES : SITUATION, HISTORIQUES, STATISTIQUES
-- =====================================================================================

-- ---- Reproduit l'onglet « Journal » du fichier Excel ---------------------------------------
CREATE OR REPLACE VIEW v_journal_mouvements AS
SELECT d.id_mouvement                                   AS numero,
       v.immatriculation,
       CONCAT(v.marque, ' ', v.modele)                  AS vehicule,
       DATE(d.date_mouvement)                           AS date_depart,
       TIME(d.date_mouvement)                           AS heure_depart,
       ld.libelle                                       AS adresse_depart,
       CONCAT_WS(' ', cd.prenom, cd.nom)                AS utilisateur_conducteur,
       d.motif,
       CONCAT_WS(' ', ca.prenom, ca.nom)                AS agent_de_vente,
       d.kilometrage                                    AS km_depart,
       d.date_retour_prevue                             AS retour_prevu,
       DATE(r.date_mouvement)                           AS date_retour,
       TIME(r.date_mouvement)                           AS heure_retour,
       CASE WHEN r.id_mouvement IS NULL THEN NULL
            ELSE DATEDIFF(r.date_mouvement, d.date_mouvement) END AS duree_jours,
       r.kilometrage                                    AS km_retour,
       CASE WHEN r.kilometrage IS NULL OR d.kilometrage IS NULL THEN NULL
            ELSE r.kilometrage - d.kilometrage END      AS km_parcourus,
       lr.libelle                                       AS adresse_retour,
       CONCAT_WS(' ', cv.prenom, cv.nom)                AS validateur,
       CASE r.contravention_constatee WHEN 1 THEN 'Oui' WHEN 0 THEN 'Non' ELSE NULL END AS contraventions_commises,
       (SELECT GROUP_CONCAT(DISTINCT IF(c.statut_paiement = 'PAYEE', 'Payée', 'Non payée'))
          FROM contravention c WHERE c.id_mouvement = d.id_mouvement) AS statut_du_paiement,
       (SELECT GROUP_CONCAT(DISTINCT c.payeur)
          FROM contravention c WHERE c.id_mouvement = d.id_mouvement) AS payeur,
       CONCAT_WS(' | ', d.observation, r.observation)   AS observation,
       d.id_location, d.id_passage
  FROM mouvement_vehicule d
  JOIN vehicule v                  ON v.id_vehicule = d.id_vehicule
  LEFT JOIN lieu ld                ON ld.id_lieu = d.id_lieu
  LEFT JOIN conducteur cd          ON cd.id_conducteur = d.id_conducteur
  LEFT JOIN commercial ca          ON ca.id_commercial = d.id_commercial
  LEFT JOIN commercial cv          ON cv.id_commercial = d.id_validateur
  LEFT JOIN mouvement_vehicule r   ON r.id_mouvement_depart = d.id_mouvement
  LEFT JOIN lieu lr                ON lr.id_lieu = r.id_lieu
 WHERE d.type_mouvement IN ('MISE_EN_LOCATION','SORTIE_INTERNE','ENVOI_GARAGE');

-- ---- Situation actuelle de chaque véhicule (dernier mouvement) -----------------------------
CREATE OR REPLACE VIEW v_situation_vehicule AS
SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
       cat.libelle AS categorie, v.statut, v.kilometrage,
       m.type_mouvement AS dernier_mouvement, m.date_mouvement AS date_dernier_mouvement,
       l.id_location AS location_en_cours, CONCAT_WS(' ', cl.prenom, cl.nom) AS client_en_cours
  FROM vehicule v
  JOIN categorie_vehicule cat ON cat.id_categorie = v.id_categorie
  LEFT JOIN mouvement_vehicule m ON m.id_mouvement = (
         SELECT m2.id_mouvement FROM mouvement_vehicule m2
          WHERE m2.id_vehicule = v.id_vehicule
          ORDER BY m2.date_mouvement DESC, m2.id_mouvement DESC LIMIT 1)
  LEFT JOIN location l ON l.id_vehicule = v.id_vehicule AND l.statut IN ('EN_COURS','EN_RETARD')
  LEFT JOIN client cl  ON cl.id_client = l.id_client;

CREATE OR REPLACE VIEW v_vehicules_remplacement_disponibles AS
SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, cat.libelle AS categorie
  FROM vehicule v
  JOIN categorie_vehicule cat ON cat.id_categorie = v.id_categorie
 WHERE v.statut = 'DISPONIBLE'
   AND NOT EXISTS (SELECT 1 FROM reservation r
                    WHERE r.id_vehicule = v.id_vehicule
                      AND r.statut IN ('CONFIRMEE','EN_ATTENTE')
                      AND CURRENT_DATE BETWEEN r.date_debut_prevue AND r.date_fin_prevue);

-- ---- Réservations : état calculé (équivalent de « Statut de la résa » du fichier RESA) -----
CREATE OR REPLACE VIEW v_etat_reservations AS
SELECT r.id_reservation, r.date_reservation, r.date_debut_prevue, r.date_fin_prevue, r.duree_jours,
       v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
       CONCAT_WS(' ', c.prenom, c.nom) AS client,
       CONCAT_WS(' ', co.prenom, co.nom) AS agent_de_vente,
       r.mission, r.lieu_mission, r.statut AS statut_confirmation, r.statut_paiement, r.statut_facturation,
       CASE
         WHEN r.statut IN ('ANNULEE','EXPIREE')   THEN 'ANNULEE'
         WHEN l.statut = 'TERMINEE'               THEN 'TERMINEE'
         WHEN l.id_location IS NOT NULL           THEN 'LOCATION_EN_COURS'
         WHEN r.statut = 'REPORTEE'               THEN 'REPORTEE'
         WHEN r.date_debut_prevue > CURRENT_DATE  THEN 'RESA_A_VENIR'
         ELSE 'A_TRAITER'
       END AS etat_resa,
       (l.id_location IS NOT NULL) AS aboutie
  FROM reservation r
  JOIN vehicule v   ON v.id_vehicule = r.id_vehicule
  JOIN client c     ON c.id_client = r.id_client
  JOIN commercial co ON co.id_commercial = r.id_commercial
  LEFT JOIN location l ON l.id_reservation = r.id_reservation;

-- Équivalent de l'en-tête du fichier RESA : « Résa à venir / En cours / Terminée / Annulée »
CREATE OR REPLACE VIEW v_synthese_reservations AS
SELECT SUM(etat_resa = 'RESA_A_VENIR')      AS resa_a_venir,
       SUM(etat_resa = 'LOCATION_EN_COURS') AS en_cours,
       SUM(etat_resa = 'TERMINEE')          AS terminees,
       SUM(etat_resa = 'ANNULEE')           AS annulees,
       COUNT(*)                             AS total
  FROM v_etat_reservations;

CREATE OR REPLACE VIEW v_reservations_abouties     AS SELECT * FROM v_etat_reservations WHERE aboutie = 1;
CREATE OR REPLACE VIEW v_reservations_non_abouties AS SELECT * FROM v_etat_reservations WHERE etat_resa = 'ANNULEE';

CREATE OR REPLACE VIEW v_historique_reservations AS
SELECT e.*, (SELECT COUNT(*) FROM suivi_reservation s WHERE s.id_reservation = e.id_reservation) AS nb_changements_statut
  FROM v_etat_reservations e;

-- ---- Affaires perdues -----------------------------------------------------------------------
CREATE OR REPLACE VIEW v_affaires_perdues_par_motif AS
SELECT COALESCE(m.libelle, 'Non renseigné') AS motif, COUNT(*) AS nb_affaires,
       COALESCE(SUM(a.montant_estime), 0) AS montant_estime_perdu
  FROM affaire_perdue a LEFT JOIN motif_non_aboutissement m ON m.id_motif = a.id_motif
 GROUP BY m.id_motif, m.libelle;

-- ---- Contraventions : reproduit l'en-tête du fichier ANATT ---------------------------------
-- Hypothèse : « Recouvrement attendu » = montants (+ frais) avancés par Hertz et à récupérer.
CREATE OR REPLACE VIEW v_synthese_contraventions AS
SELECT COALESCE(SUM(montant), 0)                                                          AS total_hors_frais,
       COALESCE(SUM(CASE WHEN statut_paiement = 'PAYEE'   THEN montant END), 0)           AS payee_hors_frais,
       COALESCE(SUM(CASE WHEN statut_paiement = 'PAYEE'   THEN frais END), 0)             AS frais_payes,
       COALESCE(SUM(CASE WHEN statut_paiement = 'IMPAYEE' THEN montant END), 0)           AS reste_a_payer,
       COALESCE(SUM(CASE WHEN payeur = 'HERTZ' AND statut_paiement = 'PAYEE'
                         THEN montant + frais END), 0)                                    AS recouvrement_attendu,
       COALESCE(SUM(montant_recouvre), 0)                                                 AS recouvrement_effectue,
       COALESCE(SUM(CASE WHEN statut_recouvrement = 'NON_LIEU' THEN montant + frais END), 0) AS recouvrement_non_lieu,
       COALESCE(SUM(frais_recouvres), 0)                                                  AS frais_recouvres,
       'XOF' AS devise
  FROM contravention;

CREATE OR REPLACE VIEW v_contraventions_detail AS
SELECT c.id_contravention, c.numero_contravention, t.libelle AS contravention, c.date_infraction,
       c.montant, c.frais, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
       cl.nom AS client, CONCAT_WS(' ', co.prenom, co.nom) AS agent_de_vente,
       c.statut_paiement, c.date_reglement, c.moyen_paiement, c.numero_quittance, c.payeur,
       c.statut_recouvrement, c.date_recouvrement, c.montant_recouvre, c.id_location
  FROM contravention c
  JOIN type_contravention t ON t.id_type_contravention = c.id_type_contravention
  JOIN vehicule v           ON v.id_vehicule = c.id_vehicule
  LEFT JOIN client cl       ON cl.id_client = c.id_client
  LEFT JOIN commercial co   ON co.id_commercial = c.id_commercial;

-- ---- Chiffre d'affaires et encaissements ---------------------------------------------------
CREATE OR REPLACE VIEW v_chiffre_affaires_mensuel AS
SELECT DATE_FORMAT(f.date_emission, '%Y-%m') AS mois,
       COUNT(*) AS nb_factures,
       SUM(f.montant_ht)  AS ca_ht,
       SUM(f.montant_ttc) AS ca_ttc
  FROM facture f GROUP BY DATE_FORMAT(f.date_emission, '%Y-%m');

CREATE OR REPLACE VIEW v_encaissements_mensuels AS
SELECT DATE_FORMAT(date_paiement, '%Y-%m') AS mois, moyen_paiement, COUNT(*) AS nb_paiements, SUM(montant) AS total_encaisse
  FROM paiement GROUP BY DATE_FORMAT(date_paiement, '%Y-%m'), moyen_paiement;

CREATE OR REPLACE VIEW v_factures_impayees AS
SELECT f.id_facture, f.numero_facture, f.date_emission, f.date_echeance, f.montant_ttc,
       COALESCE(p.paye, 0) AS deja_paye, f.montant_ttc - COALESCE(p.paye, 0) AS reste_a_payer,
       cl.nom AS client
  FROM facture f
  JOIN client cl ON cl.id_client = f.id_client
  LEFT JOIN (SELECT id_facture, SUM(montant) AS paye FROM paiement WHERE id_facture IS NOT NULL GROUP BY id_facture) p
         ON p.id_facture = f.id_facture
 WHERE f.statut_paiement <> 'PAYEE';

-- Reproduit les 3 colonnes de totaux du suivi Excel des locations (« total/semaine », « encaissé à date »,
-- « non encaissé ») par semaine ISO puis par mois, selon la date de début de location.
CREATE OR REPLACE VIEW v_suivi_encaissements_hebdo AS
SELECT YEARWEEK(l.date_debut, 3) AS semaine, COUNT(*) AS nb_locations,
       SUM(l.montant_total) AS total_semaine,
       SUM(CASE WHEN l.statut_paiement = 'PAYEE' THEN l.montant_total ELSE COALESCE(p.paye, 0) END) AS encaisse_a_date,
       SUM(l.montant_total) - SUM(CASE WHEN l.statut_paiement = 'PAYEE' THEN l.montant_total ELSE COALESCE(p.paye, 0) END) AS non_encaisse
  FROM location l
  LEFT JOIN (SELECT id_location, SUM(montant) AS paye FROM paiement WHERE id_location IS NOT NULL GROUP BY id_location) p
         ON p.id_location = l.id_location
 GROUP BY YEARWEEK(l.date_debut, 3);

CREATE OR REPLACE VIEW v_suivi_encaissements_mensuel AS
SELECT DATE_FORMAT(l.date_debut, '%Y-%m') AS mois, COUNT(*) AS nb_locations,
       SUM(l.montant_total) AS total_mois,
       SUM(CASE WHEN l.statut_paiement = 'PAYEE' THEN l.montant_total ELSE COALESCE(p.paye, 0) END) AS encaisse_a_date,
       SUM(l.montant_total) - SUM(CASE WHEN l.statut_paiement = 'PAYEE' THEN l.montant_total ELSE COALESCE(p.paye, 0) END) AS non_encaisse
  FROM location l
  LEFT JOIN (SELECT id_location, SUM(montant) AS paye FROM paiement WHERE id_location IS NOT NULL GROUP BY id_location) p
         ON p.id_location = l.id_location
 GROUP BY DATE_FORMAT(l.date_debut, '%Y-%m');

-- Reproduit le tableau Excel « Location » (une ligne par location)
CREATE OR REPLACE VIEW v_tableau_locations AS
SELECT l.id_location, cl.nom AS nom_du_client, v.immatriculation AS immat_vehicule,
       DATE(l.date_debut) AS debut, DATE(l.date_fin_prevue) AS fin, l.duree_jours AS duree,
       l.type_location,
       (SELECT GROUP_CONCAT(DISTINCT p.moyen_paiement) FROM paiement p
         WHERE p.id_location = l.id_location
            OR p.id_facture IN (SELECT lf.id_facture FROM ligne_facture lf WHERE lf.id_location = l.id_location)) AS mode_de_paiement,
       (SELECT GROUP_CONCAT(DISTINCT f.numero_facture) FROM ligne_facture lf JOIN facture f ON f.id_facture = lf.id_facture
         WHERE lf.id_location = l.id_location) AS ref_facture,
       (SELECT MIN(f.date_emission) FROM ligne_facture lf JOIN facture f ON f.id_facture = lf.id_facture
         WHERE lf.id_location = l.id_location) AS date_facturation,
       l.montant_total AS montant,
       CASE l.statut_paiement WHEN 'PAYEE' THEN 'Oui' ELSE 'Non' END AS paye,
       (SELECT MAX(DATE(p.date_paiement)) FROM paiement p
         WHERE p.id_location = l.id_location
            OR p.id_facture IN (SELECT lf.id_facture FROM ligne_facture lf WHERE lf.id_location = l.id_location)) AS date_de_paiement,
       COALESCE(co.abreviation, CONCAT_WS(' ', co.prenom, co.nom)) AS commercial,
       ag.code AS agence, l.avec_chauffeur, l.observation
  FROM location l
  JOIN client cl ON cl.id_client = l.id_client
  JOIN vehicule v ON v.id_vehicule = l.id_vehicule
  JOIN commercial co ON co.id_commercial = l.id_commercial
  LEFT JOIN agence ag ON ag.id_agence = l.id_agence;

-- ---- Performance des commerciaux -------------------------------------------------------------
CREATE OR REPLACE VIEW v_performance_commerciaux AS
SELECT t.*, ROUND(100 * t.nb_reservations_abouties / NULLIF(t.nb_reservations, 0), 1) AS taux_transformation_pct
  FROM (SELECT c.id_commercial, CONCAT_WS(' ', c.prenom, c.nom) AS commercial, c.abreviation,
               (SELECT a.code FROM agence a WHERE a.id_agence = c.id_agence) AS agence,
               (SELECT COUNT(*) FROM reservation r WHERE r.id_commercial = c.id_commercial) AS nb_reservations,
               (SELECT COUNT(*) FROM reservation r JOIN location l ON l.id_reservation = r.id_reservation
                 WHERE r.id_commercial = c.id_commercial) AS nb_reservations_abouties,
               (SELECT COUNT(*) FROM reservation r
                 WHERE r.id_commercial = c.id_commercial AND r.statut IN ('ANNULEE','EXPIREE')) AS nb_reservations_non_abouties,
               (SELECT COUNT(*) FROM affaire_perdue a WHERE a.id_commercial = c.id_commercial) AS nb_affaires_perdues,
               (SELECT COUNT(*) FROM location l WHERE l.id_commercial = c.id_commercial) AS nb_locations,
               (SELECT COALESCE(SUM(l.montant_total), 0) FROM location l WHERE l.id_commercial = c.id_commercial) AS montant_locations,
               (SELECT COALESCE(SUM(lf.montant_ht), 0) FROM ligne_facture lf JOIN location l ON l.id_location = lf.id_location
                 WHERE l.id_commercial = c.id_commercial) AS ca_facture_ht
          FROM commercial c) t;

-- ---- Maintenance -------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cout_reparations_vehicule AS
SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
       COUNT(DISTINCT p.id_passage) AS nb_passages, COALESCE(SUM(r.cout), 0) AS cout_total
  FROM vehicule v
  LEFT JOIN passage_garage p ON p.id_vehicule = v.id_vehicule
  LEFT JOIN reparation r     ON r.id_passage = p.id_passage
 GROUP BY v.id_vehicule, v.immatriculation, v.marque, v.modele;

CREATE OR REPLACE VIEW v_historique_garage AS
SELECT p.id_passage, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, g.nom AS garage,
       p.type_passage, p.date_entree, p.date_sortie_prevue, p.date_sortie_reelle, p.statut, p.cout_total,
       vr.immatriculation AS vehicule_remplacement
  FROM passage_garage p
  JOIN vehicule v ON v.id_vehicule = p.id_vehicule
  JOIN garage g   ON g.id_garage = p.id_garage
  LEFT JOIN vehicule vr ON vr.id_vehicule = p.id_vehicule_remplacement;

-- ---- Parc : synthèse, échéances, sinistres ---------------------------------------------------------
CREATE OR REPLACE VIEW v_parc_par_segment AS
SELECT v.segment_parc, COALESCE(ce.nom, 'Non renseigné') AS centre, v.statut, COUNT(*) AS nb_vehicules
  FROM vehicule v LEFT JOIN centre ce ON ce.id_centre = v.id_centre
 GROUP BY v.segment_parc, ce.nom, v.statut;

-- Véhicules dont la visite technique ou l'assurance expire dans moins de 60 jours (ou est déjà expirée)
CREATE OR REPLACE VIEW v_echeances_vehicules AS
SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, v.statut,
       v.date_prochaine_visite_technique, DATEDIFF(v.date_prochaine_visite_technique, CURRENT_DATE) AS jours_avant_visite_technique,
       v.date_expiration_assurance,       DATEDIFF(v.date_expiration_assurance, CURRENT_DATE)       AS jours_avant_fin_assurance
  FROM vehicule v
 WHERE v.statut <> 'VENDU'
   AND (DATEDIFF(v.date_prochaine_visite_technique, CURRENT_DATE) <= 60
        OR DATEDIFF(v.date_expiration_assurance, CURRENT_DATE) <= 60);

CREATE OR REPLACE VIEW v_sinistres_ouverts AS
SELECT s.id_sinistre, s.date_sinistre, s.type_sinistre, s.statut, s.description, s.declare_assurance,
       s.numero_dossier_assurance, s.montant_estime, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule
  FROM sinistre s JOIN vehicule v ON v.id_vehicule = s.id_vehicule
 WHERE s.statut <> 'CLOS';

-- =====================================================================================
-- INDICATEURS DE PERFORMANCE (KPI)
-- Conventions :
--   * Chiffre d'affaires = montant des locations (location.montant_total, prolongations incluses),
--     rattaché à la période de la DATE DE DÉBUT de la location (même règle que le suivi Excel).
--     Le CA « facturé » (factures émises) reste disponible dans v_chiffre_affaires_mensuel ; le CA réparti au prorata
--     des jours est dans v_ca_mensuel_prorata. « duree_totale_jours » = durée cumulée des locations démarrées dans
--     la période (≠ jours loués dans le mois, voir v_jours_loues_vehicule_mensuel).
--   * Jour loué = jour calendaire où le véhicule est sous contrat (jour de départ inclus, jour de
--     retour exclu ; une location d'une seule journée compte 1 jour) : identique à location.duree_jours.
--   * Jour d'immobilisation = jour où le véhicule est au garage (passage_garage) ou sous sinistre
--     immobilisant non clos ; les chevauchements ne sont comptés qu'une fois.
--   * Les taux se calculent par rapport aux « jours-véhicules » du parc : somme, pour chaque jour, des
--     véhicules présents (entre date_entree_parc et date_sortie_parc ; entrée inconnue = présent dès le début).
--   * Pour la flotte de LOCATION, filtrer sur segment_parc = 'LCD' (les véhicules en LLD/LEASING
--     ne passent pas par le journal des locations courte durée).
-- =====================================================================================

-- ---- Chiffre d'affaires : par mois, par année, par véhicule, par commercial ------------------------
CREATE OR REPLACE VIEW v_ca_mensuel AS
SELECT DATE_FORMAT(l.date_debut, '%Y-%m') AS mois, COUNT(*) AS nb_locations,
       SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total,
       SUM(CASE WHEN l.type_location = 'COURTE_DUREE' THEN l.montant_total ELSE 0 END) AS ca_courte_duree,
       SUM(CASE WHEN l.type_location = 'LONGUE_DUREE' THEN l.montant_total ELSE 0 END) AS ca_longue_duree,
       ROUND(AVG(l.montant_total), 0) AS panier_moyen
  FROM location l GROUP BY DATE_FORMAT(l.date_debut, '%Y-%m');

CREATE OR REPLACE VIEW v_ca_annuel AS
SELECT YEAR(l.date_debut) AS annee, COUNT(*) AS nb_locations, COUNT(DISTINCT l.id_vehicule) AS nb_vehicules_loues,
       COUNT(DISTINCT l.id_client) AS nb_clients, SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total,
       ROUND(SUM(l.montant_total) / COUNT(DISTINCT l.id_vehicule), 0) AS ca_moyen_par_vehicule,
       ROUND(AVG(l.montant_total), 0) AS panier_moyen
  FROM location l GROUP BY YEAR(l.date_debut);

CREATE OR REPLACE VIEW v_ca_vehicule_annuel AS
SELECT YEAR(l.date_debut) AS annee, v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule,
       COUNT(*) AS nb_locations, SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total
  FROM location l JOIN vehicule v ON v.id_vehicule = l.id_vehicule
 GROUP BY YEAR(l.date_debut), v.id_vehicule, v.immatriculation, v.marque, v.modele;

CREATE OR REPLACE VIEW v_ca_commercial_mensuel AS
SELECT DATE_FORMAT(l.date_debut, '%Y-%m') AS mois, co.id_commercial, CONCAT_WS(' ', co.prenom, co.nom) AS commercial,
       co.abreviation, COUNT(*) AS nb_locations, SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total
  FROM location l JOIN commercial co ON co.id_commercial = l.id_commercial
 GROUP BY DATE_FORMAT(l.date_debut, '%Y-%m'), co.id_commercial, co.prenom, co.nom, co.abreviation;

CREATE OR REPLACE VIEW v_ca_commercial_annuel AS
SELECT YEAR(l.date_debut) AS annee, co.id_commercial, CONCAT_WS(' ', co.prenom, co.nom) AS commercial,
       co.abreviation, COUNT(*) AS nb_locations, SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total
  FROM location l JOIN commercial co ON co.id_commercial = l.id_commercial
 GROUP BY YEAR(l.date_debut), co.id_commercial, co.prenom, co.nom, co.abreviation;

-- CA « réalisé » par mois, réparti AU PRORATA des jours de chaque location (utile pour les locations
-- à cheval sur plusieurs mois ou de longue durée) : montant_total / duree_jours pour chaque jour loué.
CREATE OR REPLACE VIEW v_ca_mensuel_prorata AS
SELECT c.annee_mois AS mois, COUNT(DISTINCT l.id_location) AS nb_locations_actives,
       COUNT(*) AS jours_vehicules_loues, ROUND(SUM(l.montant_total / l.duree_jours), 0) AS ca_prorata
  FROM location l
  JOIN calendrier c ON c.jour >= DATE(l.date_debut) AND c.jour < DATE(l.date_debut) + INTERVAL l.duree_jours DAY
 GROUP BY c.annee_mois;

-- ---- Nombre de jours loués dans le mois, par véhicule ----------------------------------------------
CREATE OR REPLACE VIEW v_jours_loues_vehicule_mensuel AS
SELECT l.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, c.annee_mois AS mois,
       COUNT(DISTINCT c.jour) AS jours_loues, DAY(LAST_DAY(MIN(c.jour))) AS jours_dans_le_mois,
       ROUND(100 * COUNT(DISTINCT c.jour) / DAY(LAST_DAY(MIN(c.jour))), 1) AS taux_occupation_mois_pct
  FROM location l
  JOIN vehicule v   ON v.id_vehicule = l.id_vehicule
  JOIN calendrier c ON c.jour >= DATE(l.date_debut) AND c.jour < DATE(l.date_debut) + INTERVAL l.duree_jours DAY
 GROUP BY l.id_vehicule, v.immatriculation, v.marque, v.modele, c.annee_mois;

-- ---- Flotte : taux d'utilisation, d'immobilisation et de rotation par mois et par segment ----------
-- (filtrer sur segment_parc = 'LCD' pour la flotte de location courte durée)
CREATE OR REPLACE VIEW v_kpi_flotte_mensuel AS
SELECT t.mois, t.segment_parc, ROUND(t.jours_vehicules_parc / t.jours_observes, 1) AS nb_vehicules_moyen,
       t.jours_vehicules_parc, t.jours_loues, t.jours_immobilises, COALESCE(n.nb_locations, 0) AS nb_locations,
       ROUND(100 * t.jours_loues / NULLIF(t.jours_vehicules_parc, 0), 1)      AS taux_utilisation_pct,
       ROUND(100 * t.jours_immobilises / NULLIF(t.jours_vehicules_parc, 0), 1) AS taux_immobilisation_pct,
       ROUND(COALESCE(n.nb_locations, 0) / NULLIF(t.jours_vehicules_parc / t.jours_observes, 0), 2) AS taux_rotation
  FROM (SELECT c.annee_mois AS mois, v.segment_parc, COUNT(DISTINCT c.jour) AS jours_observes,
               COUNT(*) AS jours_vehicules_parc,
               SUM(EXISTS (SELECT 1 FROM location l
                          WHERE l.id_vehicule = v.id_vehicule AND c.jour >= DATE(l.date_debut)
                            AND c.jour < DATE(l.date_debut) + INTERVAL l.duree_jours DAY)) AS jours_loues,
               SUM((EXISTS (SELECT 1 FROM passage_garage p
                          WHERE p.id_vehicule = v.id_vehicule AND c.jour >= p.date_entree
                            AND c.jour <= COALESCE(GREATEST(DATE_SUB(p.date_sortie_reelle, INTERVAL 1 DAY), p.date_entree), CURRENT_DATE))
                 OR EXISTS (SELECT 1 FROM sinistre s
                             WHERE s.id_vehicule = v.id_vehicule AND s.immobilisant = 1 AND c.jour >= s.date_sinistre
                               AND c.jour <= COALESCE(GREATEST(DATE_SUB(s.date_cloture, INTERVAL 1 DAY), s.date_sinistre), CURRENT_DATE)))) AS jours_immobilises
          FROM calendrier c
          JOIN vehicule v ON c.jour >= COALESCE(v.date_entree_parc, (SELECT MIN(DATE(date_debut)) FROM location))
                         AND c.jour <= COALESCE(v.date_sortie_parc, c.jour)
         WHERE c.jour BETWEEN (SELECT MIN(DATE(date_debut)) FROM location) AND CURRENT_DATE
         GROUP BY c.annee_mois, v.segment_parc) t
  LEFT JOIN (SELECT DATE_FORMAT(l.date_debut, '%Y-%m') AS mois, v.segment_parc, COUNT(*) AS nb_locations
               FROM location l JOIN vehicule v ON v.id_vehicule = l.id_vehicule
              GROUP BY DATE_FORMAT(l.date_debut, '%Y-%m'), v.segment_parc) n
         ON n.mois = t.mois AND n.segment_parc = t.segment_parc;

-- ---- Durée de vie de chaque véhicule à date, avec son bilan cumulé ----------------------------------
-- Début de vie = date de mise en service (à défaut, date d'entrée au parc). Fin = date de sortie (vente) ou aujourd'hui.
CREATE OR REPLACE VIEW v_duree_vie_vehicule AS
SELECT x.*,
       ROUND(100 * x.jours_loues_total / NULLIF(x.duree_vie_jours, 0), 1)       AS taux_utilisation_vie_pct,
       ROUND(100 * x.jours_immobilises_total / NULLIF(x.duree_vie_jours, 0), 1) AS taux_immobilisation_vie_pct
  FROM (SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, v.segment_parc, v.statut,
               COALESCE(v.date_mise_en_service, v.date_entree_parc) AS date_debut_vie,
               COALESCE(v.date_sortie_parc, CURRENT_DATE)           AS date_fin_vie,
               DATEDIFF(COALESCE(v.date_sortie_parc, CURRENT_DATE), COALESCE(v.date_mise_en_service, v.date_entree_parc)) AS duree_vie_jours,
               TIMESTAMPDIFF(MONTH, COALESCE(v.date_mise_en_service, v.date_entree_parc), COALESCE(v.date_sortie_parc, CURRENT_DATE)) AS duree_vie_mois,
               ROUND(DATEDIFF(COALESCE(v.date_sortie_parc, CURRENT_DATE), COALESCE(v.date_mise_en_service, v.date_entree_parc)) / 365.25, 2) AS duree_vie_annees,
               v.kilometrage,
               (SELECT COUNT(*) FROM location l WHERE l.id_vehicule = v.id_vehicule)                    AS nb_locations,
               (SELECT COALESCE(SUM(l.duree_jours), 0) FROM location l WHERE l.id_vehicule = v.id_vehicule) AS jours_loues_total,
               (SELECT COALESCE(SUM(l.montant_total), 0) FROM location l WHERE l.id_vehicule = v.id_vehicule) AS ca_total,
               (SELECT COUNT(*) FROM passage_garage p WHERE p.id_vehicule = v.id_vehicule)               AS nb_passages_garage,
               (SELECT COALESCE(SUM(p.cout_total), 0) FROM passage_garage p WHERE p.id_vehicule = v.id_vehicule) AS cout_maintenance_total,
               (SELECT COUNT(*) FROM sinistre s WHERE s.id_vehicule = v.id_vehicule)                     AS nb_sinistres,
               (SELECT COUNT(*) FROM calendrier c
                 WHERE c.jour >= COALESCE(v.date_mise_en_service, v.date_entree_parc)
                   AND c.jour <= COALESCE(v.date_sortie_parc, CURRENT_DATE)
                   AND (EXISTS (SELECT 1 FROM passage_garage p
                          WHERE p.id_vehicule = v.id_vehicule AND c.jour >= p.date_entree
                            AND c.jour <= COALESCE(GREATEST(DATE_SUB(p.date_sortie_reelle, INTERVAL 1 DAY), p.date_entree), CURRENT_DATE))
                 OR EXISTS (SELECT 1 FROM sinistre s
                             WHERE s.id_vehicule = v.id_vehicule AND s.immobilisant = 1 AND c.jour >= s.date_sinistre
                               AND c.jour <= COALESCE(GREATEST(DATE_SUB(s.date_cloture, INTERVAL 1 DAY), s.date_sinistre), CURRENT_DATE)))) AS jours_immobilises_total
          FROM vehicule v) x;

-- =====================================================================================
-- 13. PROCÉDURES STOCKÉES (statistiques sur une période + maintenance de données)
-- =====================================================================================
DELIMITER //

-- Chiffre d'affaires facturé sur une période : total, puis ventilation par type de location
CREATE PROCEDURE sp_chiffre_affaires(IN p_debut DATE, IN p_fin DATE)
BEGIN
  SELECT COUNT(*) AS nb_factures, COALESCE(SUM(montant_ht), 0) AS ca_ht, COALESCE(SUM(montant_ttc), 0) AS ca_ttc
    FROM facture WHERE date_emission BETWEEN p_debut AND p_fin;
  SELECT COALESCE(l.type_location, 'AUTRE') AS type_prestation, COUNT(DISTINCT f.id_facture) AS nb_factures,
         SUM(lf.montant_ht) AS ca_ht, SUM(ROUND(lf.montant_ht * (1 + f.taux_tva / 100), 2)) AS ca_ttc
    FROM facture f
    JOIN ligne_facture lf ON lf.id_facture = f.id_facture
    LEFT JOIN location l  ON l.id_location = lf.id_location
   WHERE f.date_emission BETWEEN p_debut AND p_fin
   GROUP BY COALESCE(l.type_location, 'AUTRE');
END//

-- Chiffre d'affaires d'une période (règle : date de début de location) :
--   1) total  2) par mois  3) par véhicule  4) par commercial
CREATE PROCEDURE sp_kpi_chiffre_affaires(IN p_debut DATE, IN p_fin DATE)
BEGIN
  SELECT p_debut AS debut, p_fin AS fin, COUNT(*) AS nb_locations, COALESCE(SUM(duree_jours), 0) AS duree_totale_jours,
         COALESCE(SUM(montant_total), 0) AS ca_total, ROUND(AVG(montant_total), 0) AS panier_moyen
    FROM location WHERE DATE(date_debut) BETWEEN p_debut AND p_fin;
  SELECT DATE_FORMAT(date_debut, '%Y-%m') AS mois, COUNT(*) AS nb_locations, SUM(duree_jours) AS duree_totale_jours,
         SUM(montant_total) AS ca_total
    FROM location WHERE DATE(date_debut) BETWEEN p_debut AND p_fin
   GROUP BY DATE_FORMAT(date_debut, '%Y-%m') ORDER BY mois;
  SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, COUNT(*) AS nb_locations,
         SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total
    FROM location l JOIN vehicule v ON v.id_vehicule = l.id_vehicule
   WHERE DATE(l.date_debut) BETWEEN p_debut AND p_fin
   GROUP BY v.id_vehicule, v.immatriculation, v.marque, v.modele ORDER BY ca_total DESC;
  SELECT co.id_commercial, CONCAT_WS(' ', co.prenom, co.nom) AS commercial, co.abreviation, COUNT(*) AS nb_locations,
         SUM(l.duree_jours) AS duree_totale_jours, SUM(l.montant_total) AS ca_total
    FROM location l JOIN commercial co ON co.id_commercial = l.id_commercial
   WHERE DATE(l.date_debut) BETWEEN p_debut AND p_fin
   GROUP BY co.id_commercial, co.prenom, co.nom, co.abreviation ORDER BY ca_total DESC;
END//

-- Indicateurs de flotte sur une période, pour un segment (NULL = tous ; 'LCD' = flotte de location courte durée) :
--   1) synthèse : taux d'utilisation, taux d'immobilisation, taux de rotation
--   2) détail par véhicule
CREATE PROCEDURE sp_kpi_flotte(IN p_debut DATE, IN p_fin DATE, IN p_segment VARCHAR(10))
BEGIN
  DECLARE v_fin DATE DEFAULT LEAST(p_fin, CURRENT_DATE);
  DECLARE v_jours INT DEFAULT GREATEST(DATEDIFF(LEAST(p_fin, CURRENT_DATE), p_debut) + 1, 0);
  DROP TEMPORARY TABLE IF EXISTS tmp_kpi_flotte;
  CREATE TEMPORARY TABLE tmp_kpi_flotte AS
  SELECT v.id_vehicule, v.immatriculation, CONCAT(v.marque, ' ', v.modele) AS vehicule, v.segment_parc,
         COUNT(*) AS jours_parc,
         SUM(EXISTS (SELECT 1 FROM location l
                          WHERE l.id_vehicule = v.id_vehicule AND c.jour >= DATE(l.date_debut)
                            AND c.jour < DATE(l.date_debut) + INTERVAL l.duree_jours DAY)) AS jours_loues,
         SUM((EXISTS (SELECT 1 FROM passage_garage p
                          WHERE p.id_vehicule = v.id_vehicule AND c.jour >= p.date_entree
                            AND c.jour <= COALESCE(GREATEST(DATE_SUB(p.date_sortie_reelle, INTERVAL 1 DAY), p.date_entree), CURRENT_DATE))
                 OR EXISTS (SELECT 1 FROM sinistre s
                             WHERE s.id_vehicule = v.id_vehicule AND s.immobilisant = 1 AND c.jour >= s.date_sinistre
                               AND c.jour <= COALESCE(GREATEST(DATE_SUB(s.date_cloture, INTERVAL 1 DAY), s.date_sinistre), CURRENT_DATE)))) AS jours_immobilises,
         (SELECT COUNT(*) FROM location l2 WHERE l2.id_vehicule = v.id_vehicule
             AND DATE(l2.date_debut) BETWEEN p_debut AND p_fin) AS nb_locations
    FROM vehicule v
    JOIN calendrier c ON c.jour BETWEEN p_debut AND v_fin
                     AND c.jour >= COALESCE(v.date_entree_parc, p_debut)
                     AND c.jour <= COALESCE(v.date_sortie_parc, v_fin)
   WHERE (p_segment IS NULL OR v.segment_parc = p_segment)
   GROUP BY v.id_vehicule, v.immatriculation, v.marque, v.modele, v.segment_parc;

  SELECT p_debut AS debut, v_fin AS fin_effective, COUNT(*) AS nb_vehicules,
         ROUND(SUM(jours_parc) / NULLIF(v_jours, 0), 1) AS nb_vehicules_moyen,
         SUM(jours_parc) AS jours_vehicules_parc, SUM(jours_loues) AS jours_loues,
         SUM(jours_immobilises) AS jours_immobilises, SUM(nb_locations) AS nb_locations,
         ROUND(100 * SUM(jours_loues) / NULLIF(SUM(jours_parc), 0), 1)      AS taux_utilisation_pct,
         ROUND(100 * SUM(jours_immobilises) / NULLIF(SUM(jours_parc), 0), 1) AS taux_immobilisation_pct,
         ROUND(SUM(nb_locations) / NULLIF(SUM(jours_parc) / NULLIF(v_jours, 0), 0), 2) AS taux_rotation
    FROM tmp_kpi_flotte;

  SELECT t.*, ROUND(100 * t.jours_loues / NULLIF(t.jours_parc, 0), 1)      AS taux_utilisation_pct,
              ROUND(100 * t.jours_immobilises / NULLIF(t.jours_parc, 0), 1) AS taux_immobilisation_pct
    FROM tmp_kpi_flotte t ORDER BY taux_utilisation_pct DESC, t.immatriculation;
  DROP TEMPORARY TABLE IF EXISTS tmp_kpi_flotte;
END//

-- Prolonge le calendrier (par défaut jusqu'à 2040) : CALL sp_peupler_calendrier('2050-12-31');
CREATE PROCEDURE sp_peupler_calendrier(IN p_fin DATE)
BEGIN
  DECLARE v_debut DATE;
  SET v_debut = COALESCE((SELECT MAX(jour) + INTERVAL 1 DAY FROM calendrier), DATE '2020-01-01');
  INSERT INTO calendrier (jour)
  SELECT v_debut + INTERVAL (a.n + 10*b.n + 100*c.n + 1000*d.n + 10000*e.n) DAY
    FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
         (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b,
         (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c,
         (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d,
         (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) e
   WHERE v_debut + INTERVAL (a.n + 10*b.n + 100*c.n + 1000*d.n + 10000*e.n) DAY <= p_fin;
END//

-- Performance des commerciaux sur une période
CREATE PROCEDURE sp_performance_commerciaux(IN p_debut DATE, IN p_fin DATE)
BEGIN
  SELECT t.*, ROUND(100 * t.nb_reservations_abouties / NULLIF(t.nb_reservations, 0), 1) AS taux_transformation_pct
    FROM (SELECT c.id_commercial, CONCAT_WS(' ', c.prenom, c.nom) AS commercial, c.abreviation,
                 (SELECT COUNT(*) FROM reservation r WHERE r.id_commercial = c.id_commercial
                     AND r.date_reservation BETWEEN p_debut AND p_fin) AS nb_reservations,
                 (SELECT COUNT(*) FROM reservation r JOIN location l ON l.id_reservation = r.id_reservation
                   WHERE r.id_commercial = c.id_commercial AND r.date_reservation BETWEEN p_debut AND p_fin) AS nb_reservations_abouties,
                 (SELECT COUNT(*) FROM affaire_perdue a WHERE a.id_commercial = c.id_commercial
                     AND a.date_reservation BETWEEN p_debut AND p_fin) AS nb_affaires_perdues,
                 (SELECT COUNT(*) FROM location l WHERE l.id_commercial = c.id_commercial
                     AND DATE(l.date_debut) BETWEEN p_debut AND p_fin) AS nb_locations,
                 (SELECT COALESCE(SUM(l.montant_total), 0) FROM location l WHERE l.id_commercial = c.id_commercial
                     AND DATE(l.date_debut) BETWEEN p_debut AND p_fin) AS montant_locations,
                 (SELECT COALESCE(SUM(lf.montant_ht), 0) FROM ligne_facture lf
                    JOIN facture f ON f.id_facture = lf.id_facture JOIN location l ON l.id_location = lf.id_location
                   WHERE l.id_commercial = c.id_commercial AND f.date_emission BETWEEN p_debut AND p_fin) AS ca_facture_ht
            FROM commercial c) t
   ORDER BY t.montant_locations DESC;
END//

-- Passe en EN_RETARD les locations dont la date de retour prévue est dépassée
-- (à planifier chaque jour, voir l'EVENT en commentaire ci-dessous)
CREATE PROCEDURE sp_marquer_locations_en_retard()
BEGIN
  UPDATE location SET statut = 'EN_RETARD'
   WHERE statut = 'EN_COURS' AND date_retour_reelle IS NULL AND date_fin_prevue < NOW();
END//

-- Recalcule le statut et le kilométrage des véhicules à partir du journal des mouvements
-- (utile après un import d'historique avec @import_historique = 1)
CREATE PROCEDURE sp_recalculer_statuts_vehicules()
BEGIN
  UPDATE vehicule v
    JOIN mouvement_vehicule m ON m.id_vehicule = v.id_vehicule
     SET v.statut = CASE m.type_mouvement
                      WHEN 'MISE_EN_LOCATION'  THEN 'LOUE'
                      WHEN 'SORTIE_INTERNE'    THEN 'EN_SORTIE'
                      WHEN 'ENVOI_GARAGE'      THEN 'AU_GARAGE'
                      WHEN 'SORTIE_DEFINITIVE' THEN 'VENDU'
                      ELSE 'DISPONIBLE' END
   WHERE NOT EXISTS (SELECT 1 FROM mouvement_vehicule m2
                      WHERE m2.id_vehicule = m.id_vehicule
                        AND (m2.date_mouvement > m.date_mouvement
                             OR (m2.date_mouvement = m.date_mouvement AND m2.id_mouvement > m.id_mouvement)));
  UPDATE vehicule v SET v.statut = 'IMMOBILISE'
   WHERE v.statut = 'DISPONIBLE'
     AND EXISTS (SELECT 1 FROM sinistre s WHERE s.id_vehicule = v.id_vehicule AND s.immobilisant = 1 AND s.statut <> 'CLOS');
  UPDATE vehicule v
     SET v.kilometrage = GREATEST(v.kilometrage,
           COALESCE((SELECT MAX(m.kilometrage) FROM mouvement_vehicule m WHERE m.id_vehicule = v.id_vehicule), 0));
END//

DELIMITER ;

-- Exécution quotidienne optionnelle (nécessite : SET GLOBAL event_scheduler = ON;)
-- CREATE EVENT ev_locations_en_retard ON SCHEDULE EVERY 1 DAY STARTS CURRENT_DATE + INTERVAL 1 DAY
--   DO CALL sp_marquer_locations_en_retard();

-- =====================================================================================
-- 14. DONNÉES DE RÉFÉRENCE (issues des fichiers CSV / Excel)
-- =====================================================================================

-- Compte administrateur initial : le mot de passe ci-dessous N'EST PAS un vrai hash,
-- il rend la connexion impossible tant que vous ne l'avez pas remplacé (hash bcrypt/argon2 côté application).
INSERT INTO administrateur (nom, prenom, email, login, mot_de_passe_hash)
VALUES ('Administrateur', 'Principal', 'admin@exemple.local', 'admin', '!A_REMPLACER_PAR_UN_HASH!');

-- Calendrier 2020-2040 (extensible avec sp_peupler_calendrier)
CALL sp_peupler_calendrier('2040-12-31');

-- Agences (fichier « Liste des agents de vente »)
INSERT INTO agence (code, nom) VALUES
 ('APS', 'Agence principale'),
 ('AEP', 'Agence Aéroport'),
 ('AGT', 'Agence Golden Tulip');

-- Lieux rencontrés dans le journal des mouvements
INSERT INTO lieu (libelle, type_lieu, ville, id_agence) VALUES
 ('Direction Hertz',  'AGENCE',   'Cotonou', (SELECT id_agence FROM agence WHERE code = 'APS')),
 ('Agence Aéroport',  'AEROPORT', 'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AEP')),
 ('Golden Tulip',     'HOTEL',    'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AGT')),
 ('Sofitel',          'HOTEL',    'Cotonou', NULL);

-- Catégories : à compléter avec VOS tarifs (0 = non renseigné)
INSERT INTO categorie_vehicule (libelle, tarif_journalier) VALUES
 ('Citadine / Berline',        0),
 ('SUV / 4x4',                 0),
 ('Pick-up',                   0),
 ('Utilitaire / Minibus',      0),
 ('Non classé',                0);      -- fiches incomplètes à compléter

-- Modèles normalisés (variantes orthographiques du fichier parc regroupées).
-- La catégorie est une proposition de classement : à valider.
SET @c_ville = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Citadine / Berline');
SET @c_suv   = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'SUV / 4x4');
SET @c_pick  = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Pick-up');
SET @c_bus   = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Utilitaire / Minibus');
SET @c_nc    = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Non classé');
INSERT INTO modele_vehicule (marque, nom, id_categorie) VALUES
 ('NISSAN','NP300',@c_pick), ('NISSAN','HARDBODY',@c_pick), ('NISSAN','KICKS',@c_suv), ('NISSAN','QASHQAI',@c_suv),
 ('TOYOTA','HILUX',@c_pick), ('TOYOTA','PRADO',@c_suv), ('TOYOTA','RAV4',@c_suv), ('TOYOTA','FORTUNER',@c_suv),
 ('TOYOTA','COROLLA',@c_ville), ('TOYOTA','COROLLA CROSS',@c_suv), ('TOYOTA','STARLET',@c_ville), ('TOYOTA','HIACE',@c_bus),
 ('MITSUBISHI','L200',@c_pick), ('MITSUBISHI','PAJERO SPORT',@c_suv),
 ('ISUZU','D-MAX',@c_pick),
 ('SUZUKI','SWIFT',@c_ville), ('SUZUKI','VITARA',@c_suv),
 ('JEEP','GRAND CHEROKEE',@c_suv),
 ('MERCEDES','E350',@c_ville),
 ('PEUGEOT','408 GT',@c_ville),
 ('GEELY','STARRAY',@c_suv),
 ('FOTON','SUPPORTER',@c_bus), ('FOTON','VIEW CS2',@c_bus), ('FOTON','BJ6730',@c_bus), ('FOTON','MINI-BUS',@c_bus),
 -- modèle provisoire pour les véhicules dont la marque/le modèle n'est pas connu (à corriger ensuite)
 ('INCONNU','À PRÉCISER',@c_nc);

-- Types de contraventions et montants observés dans le fichier ANATT
INSERT INTO type_contravention (libelle, montant_standard) VALUES
 ('Excès de vitesse en agglomération',                    10000),
 ('Refus d''obtempérer',                                  12000),
 ('Non-respect des feux tricolores',                       5000),
 ('Communication téléphonique au guidon ou au volant',    20000),
 ('Défaut d''assurance',                                  15000),
 ('Non-respect du sens giratoire',                         6000),
 ('Non-respect des couloirs de circulation',               5000),
 ('Chevauchement',                                         6000);

-- Motifs de non-aboutissement (suggestions à adapter à votre activité)
INSERT INTO motif_non_aboutissement (code, libelle) VALUES
 ('ANNULATION_CLIENT',      'Annulation par le client'),
 ('VEHICULE_INDISPONIBLE',  'Véhicule demandé indisponible'),
 ('PRIX',                   'Tarif jugé trop élevé'),
 ('NON_CONFIRME',           'Réservation non confirmée / pas de réponse du client'),
 ('BON_COMMANDE_ABSENT',    'Bon de commande jamais reçu'),
 ('CHOIX_CONCURRENT',       'Client parti chez un concurrent'),
 ('CHANGEMENT_BESOIN',      'Besoin du client modifié ou supprimé'),
 ('AUTRE',                  'Autre motif');
