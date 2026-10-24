-- Données de référence pour une base neuve, exécutées après schema.sql.
-- Le pack complet du parc (agents, centres, véhicules, mouvements…) est importé
-- séparément via npm run db:import-parc (server/src/db/donnees_initiales_parc_agents.sql).
SET NAMES utf8mb4;

-- Compte de démonstration : responsable@hertz.bj / hertz2025.
INSERT IGNORE INTO administrateur (nom, prenom, email, login, mot_de_passe_hash)
VALUES (
  'Orou',
  'Koffi',
  'responsable@hertz.bj',
  'responsable',
  '$2b$10$Wr4gXal.lc8kBaoa1xbFRu1JZJAyqaUChYdSzde.1/SdIhH/En0N2'
);

-- Calendrier jusqu'en 2040 (extensible : CALL sp_peupler_calendrier('2050-12-31')).
CALL sp_peupler_calendrier('2040-12-31');

-- Agences (fichier « Liste des agents de vente »)
INSERT IGNORE INTO agence (code, nom) VALUES
 ('APS', 'Agence principale'),
 ('AEP', 'Agence Aéroport'),
 ('AGT', 'Agence Golden Tulip');

-- Lieux rencontrés dans le journal des mouvements
INSERT IGNORE INTO lieu (libelle, type_lieu, ville, id_agence) VALUES
 ('Direction Hertz',  'AGENCE',   'Cotonou', (SELECT id_agence FROM agence WHERE code = 'APS')),
 ('Agence Aéroport',  'AEROPORT', 'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AEP')),
 ('Golden Tulip',     'HOTEL',    'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AGT')),
 ('Sofitel',          'HOTEL',    'Cotonou', NULL);

-- Catégories : à compléter avec VOS tarifs (0 = non renseigné)
INSERT IGNORE INTO categorie_vehicule (libelle, tarif_journalier) VALUES
 ('Citadine / Berline',        0),
 ('SUV / 4x4',                 0),
 ('Pick-up',                   0),
 ('Utilitaire / Minibus',      0),
 ('Non classé',                0);

-- Modèles normalisés (variantes orthographiques du fichier parc regroupées).
-- La catégorie est une proposition de classement : à valider.
SET @c_ville = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Citadine / Berline');
SET @c_suv   = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'SUV / 4x4');
SET @c_pick  = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Pick-up');
SET @c_bus   = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Utilitaire / Minibus');
SET @c_nc    = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Non classé');
INSERT IGNORE INTO modele_vehicule (marque, nom, id_categorie) VALUES
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
INSERT IGNORE INTO type_contravention (libelle, montant_standard) VALUES
 ('Excès de vitesse en agglomération',                    10000),
 ('Refus d''obtempérer',                                  12000),
 ('Non-respect des feux tricolores',                       5000),
 ('Communication téléphonique au guidon ou au volant',    20000),
 ('Défaut d''assurance',                                  15000),
 ('Non-respect du sens giratoire',                         6000),
 ('Non-respect des couloirs de circulation',               5000),
 ('Chevauchement',                                         6000);

-- Motifs de non-aboutissement (suggestions à adapter à votre activité)
INSERT IGNORE INTO motif_non_aboutissement (code, libelle) VALUES
 ('ANNULATION_CLIENT',      'Annulation par le client'),
 ('VEHICULE_INDISPONIBLE',  'Véhicule demandé indisponible'),
 ('PRIX',                   'Tarif jugé trop élevé'),
 ('NON_CONFIRME',           'Réservation non confirmée / pas de réponse du client'),
 ('BON_COMMANDE_ABSENT',    'Bon de commande jamais reçu'),
 ('CHOIX_CONCURRENT',       'Client parti chez un concurrent'),
 ('CHANGEMENT_BESOIN',      'Besoin du client modifié ou supprimé'),
 ('AUTRE',                  'Autre motif');
