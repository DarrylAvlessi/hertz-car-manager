-- Hertz Bénin — jeu de démo (reprend les données du prototype frontend).
-- Mot de passe admin : hertz2025 (hash bcrypt ci-dessous).
-- Exécution : npm run db:migrate (server/) quand MySQL est disponible.

USE hertz_benin;

INSERT INTO administrateur (nom, email, password_hash, role) VALUES
  ('Koffi Orou', 'responsable@hertz.bj',
   '$2b$10$vgC9DvR.CdUBlSycCk0EQemwVVdGOXe.jM1ic9TyN2gTk3CxyrUoi', 'responsable')
ON DUPLICATE KEY UPDATE nom = VALUES(nom);

INSERT INTO commercial (id, nom, contact) VALUES
  (1, 'Aïcha Sossa', 'a.sossa@hertz.bj'),
  (2, 'Koffi Orou', 'k.orou@hertz.bj'),
  (3, 'Mariam Bio', 'm.bio@hertz.bj'),
  (4, 'David Hounkpatin', 'd.hounkpatin@hertz.bj')
ON DUPLICATE KEY UPDATE nom = VALUES(nom), contact = VALUES(contact);

INSERT INTO client (id, nom, type, telephone) VALUES
  (1, 'Groupe Tèkponon', 'Entreprise', '+229 01 97 12 43 08'),
  (2, 'Sandra Adé', 'Particulier', '+229 01 96 88 10 25'),
  (3, 'Cabinet A2C', 'Entreprise', '+229 01 95 32 90 11'),
  (4, 'Jean Loko', 'Particulier', '+229 01 97 41 22 16'),
  (5, 'Alex Morgan', 'Particulier', '+229 01 90 11 22 33'),
  (6, 'Sophie Adjovi', 'Particulier', '+229 01 91 44 55 66'),
  (7, 'Marc Houénou', 'Particulier', '+229 01 92 77 88 99'),
  (8, 'Sarah Johnson', 'Particulier', '+229 01 93 00 11 22')
ON DUPLICATE KEY UPDATE nom = VALUES(nom), type = VALUES(type), telephone = VALUES(telephone);

INSERT INTO vehicule (id, immatriculation, marque_modele, categorie, kilometrage, statut) VALUES
  (1, 'AA 4821 RB', 'Toyota Corolla', 'Berline', 42650, 'Disponible'),
  (2, 'BB 1374 RB', 'Hyundai Tucson', 'SUV', 28100, 'En location'),
  (3, 'CC 9082 RB', 'Mercedes Classe C', 'Premium', 35820, 'Entretien'),
  (4, 'AB 4510 RB', 'Suzuki Dzire', 'Citadine', 51240, 'Disponible')
ON DUPLICATE KEY UPDATE
  marque_modele = VALUES(marque_modele), categorie = VALUES(categorie),
  kilometrage = VALUES(kilometrage), statut = VALUES(statut);

INSERT INTO location (reference, client_id, vehicule_id, commercial_id, type, date_debut, date_fin, montant, statut) VALUES
  ('LOC-02581', 1, 2, 1, 'Longue durée', '2025-06-01', '2025-09-30', 6200000, 'En cours'),
  ('LOC-02579', 2, 1, 2, 'Courte durée', '2025-06-18', '2025-06-24', 900000, 'À retourner'),
  ('LOC-02572', 3, 3, 3, 'Longue durée', '2025-01-05', '2025-12-31', 9900000, 'En cours'),
  ('LOC-02561', 4, 4, 1, 'Courte durée', '2025-06-10', '2025-06-16', 1400000, 'Retourné')
ON DUPLICATE KEY UPDATE
  client_id = VALUES(client_id), vehicule_id = VALUES(vehicule_id),
  commercial_id = VALUES(commercial_id), type = VALUES(type),
  date_debut = VALUES(date_debut), date_fin = VALUES(date_fin),
  montant = VALUES(montant), statut = VALUES(statut);

INSERT INTO reservation (reference, client_id, vehicule_id, commercial_id, date_depart, duree_jours, statut) VALUES
  ('RES-20841', 5, 1, 1, '2025-06-18', 3, 'Aboutie'),
  ('RES-20839', 6, 2, 2, '2025-06-18', 6, 'Confirmée'),
  ('RES-20835', 7, NULL, 3, '2025-06-19', 1, 'En attente'),
  ('RES-20828', 8, 1, 1, '2025-06-15', 3, 'Non aboutie')
ON DUPLICATE KEY UPDATE
  client_id = VALUES(client_id), vehicule_id = VALUES(vehicule_id),
  commercial_id = VALUES(commercial_id), date_depart = VALUES(date_depart),
  duree_jours = VALUES(duree_jours), statut = VALUES(statut);

INSERT INTO maintenance (vehicule_id, date_entree, date_sortie, motif, cout, remplacement_id, statut) VALUES
  (3, '2025-06-10', NULL, 'Révision 30 000 km + plaquettes', 185000, 4, 'En cours');

INSERT INTO mouvement (vehicule_id, type, date_mouvement, commentaire) VALUES
  (1, 'Acquisition', '2023-03-12', 'Achat concessionnaire Cotonou'),
  (2, 'Acquisition', '2023-06-04', 'Achat concessionnaire Cotonou'),
  (3, 'Acquisition', '2022-11-20', 'Import occasion Allemagne'),
  (4, 'Acquisition', '2023-09-15', 'Achat concessionnaire Cotonou'),
  (2, 'Mise en location', '2025-06-01', 'LOC-02581 Groupe Tèkponon'),
  (4, 'Retour', '2025-06-16', 'LOC-02561 Jean Loko'),
  (3, 'Maintenance', '2025-06-10', 'Révision 30 000 km');
