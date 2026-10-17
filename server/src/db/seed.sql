-- Données de référence pour une base neuve, exécutées après schema.sql.
-- Le compte initial ne permet pas de se connecter : remplacez son hash avant usage.

INSERT INTO administrateur (nom, prenom, email, login, mot_de_passe_hash)
VALUES ('Administrateur', 'Principal', 'admin@exemple.local', 'admin', '!A_REMPLACER_PAR_UN_HASH!');

CALL sp_peupler_calendrier('2040-12-31');

INSERT INTO agence (code, nom) VALUES
 ('APS', 'Agence principale'),
 ('AEP', 'Agence Aéroport'),
 ('AGT', 'Agence Golden Tulip');

INSERT INTO lieu (libelle, type_lieu, ville, id_agence) VALUES
 ('Direction Hertz', 'AGENCE', 'Cotonou', (SELECT id_agence FROM agence WHERE code = 'APS')),
 ('Agence Aéroport', 'AEROPORT', 'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AEP')),
 ('Golden Tulip', 'HOTEL', 'Cotonou', (SELECT id_agence FROM agence WHERE code = 'AGT')),
 ('Sofitel', 'HOTEL', 'Cotonou', NULL);

INSERT INTO categorie_vehicule (libelle, tarif_journalier) VALUES
 ('Citadine / Berline', 0),
 ('SUV / 4x4', 0),
 ('Pick-up', 0),
 ('Utilitaire / Minibus', 0),
 ('Non classé', 0);

SET @c_ville = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Citadine / Berline');
SET @c_suv = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'SUV / 4x4');
SET @c_pick = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Pick-up');
SET @c_bus = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Utilitaire / Minibus');
SET @c_nc = (SELECT id_categorie FROM categorie_vehicule WHERE libelle = 'Non classé');

INSERT INTO modele_vehicule (marque, nom, id_categorie) VALUES
 ('NISSAN', 'NP300', @c_pick), ('NISSAN', 'HARDBODY', @c_pick),
 ('NISSAN', 'KICKS', @c_suv), ('NISSAN', 'QASHQAI', @c_suv),
 ('TOYOTA', 'HILUX', @c_pick), ('TOYOTA', 'PRADO', @c_suv),
 ('TOYOTA', 'RAV4', @c_suv), ('TOYOTA', 'FORTUNER', @c_suv),
 ('TOYOTA', 'COROLLA', @c_ville), ('TOYOTA', 'COROLLA CROSS', @c_suv),
 ('TOYOTA', 'STARLET', @c_ville), ('TOYOTA', 'HIACE', @c_bus),
 ('MITSUBISHI', 'L200', @c_pick), ('MITSUBISHI', 'PAJERO SPORT', @c_suv),
 ('ISUZU', 'D-MAX', @c_pick), ('SUZUKI', 'SWIFT', @c_ville),
 ('SUZUKI', 'VITARA', @c_suv), ('JEEP', 'GRAND CHEROKEE', @c_suv),
 ('MERCEDES', 'E350', @c_ville), ('PEUGEOT', '408 GT', @c_ville),
 ('GEELY', 'STARRAY', @c_suv), ('FOTON', 'SUPPORTER', @c_bus),
 ('FOTON', 'VIEW CS2', @c_bus), ('FOTON', 'BJ6730', @c_bus),
 ('FOTON', 'MINI-BUS', @c_bus), ('INCONNU', 'À PRÉCISER', @c_nc);

INSERT INTO type_contravention (libelle, montant_standard) VALUES
 ('Excès de vitesse en agglomération', 10000),
 ('Refus d''obtempérer', 12000),
 ('Non-respect des feux tricolores', 5000),
 ('Communication téléphonique au guidon ou au volant', 20000),
 ('Défaut d''assurance', 15000),
 ('Non-respect du sens giratoire', 6000),
 ('Non-respect des couloirs de circulation', 5000),
 ('Chevauchement', 6000);

INSERT INTO motif_non_aboutissement (code, libelle) VALUES
 ('ANNULATION_CLIENT', 'Annulation par le client'),
 ('VEHICULE_INDISPONIBLE', 'Véhicule demandé indisponible'),
 ('PRIX', 'Tarif jugé trop élevé'),
 ('NON_CONFIRME', 'Réservation non confirmée / pas de réponse du client'),
 ('BON_COMMANDE_ABSENT', 'Bon de commande jamais reçu'),
 ('CHOIX_CONCURRENT', 'Client parti chez un concurrent'),
 ('CHANGEMENT_BESOIN', 'Besoin du client modifié ou supprimé'),
 ('AUTRE', 'Autre motif');
