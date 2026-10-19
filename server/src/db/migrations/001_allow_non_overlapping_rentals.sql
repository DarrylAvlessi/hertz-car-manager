-- Allows a vehicle with another active rental to be scheduled again only when
-- the new location does not overlap that rental.
DROP TRIGGER IF EXISTS trg_mouvement_bi;

DELIMITER //
CREATE TRIGGER trg_mouvement_bi BEFORE INSERT ON mouvement_vehicule FOR EACH ROW
BEGIN
  DECLARE v_statut VARCHAR(20);
  DECLARE v_type_dep VARCHAR(30); DECLARE v_veh_dep INT; DECLARE v_km_dep INT; DECLARE v_date_dep DATETIME;
  IF COALESCE(@import_historique, 0) = 0 THEN
    IF NEW.type_mouvement IN ('MISE_EN_LOCATION','SORTIE_INTERNE','ENVOI_GARAGE','SORTIE_DEFINITIVE') THEN
      SELECT statut INTO v_statut FROM vehicule WHERE id_vehicule = NEW.id_vehicule;
      IF v_statut <> 'DISPONIBLE'
         AND NOT (NEW.type_mouvement = 'ENVOI_GARAGE' AND v_statut = 'IMMOBILISE')
         AND NOT (
           NEW.type_mouvement = 'MISE_EN_LOCATION'
           AND v_statut = 'LOUE'
           AND NEW.id_location IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM location nouvelle
               JOIN location existante
                 ON existante.id_vehicule = nouvelle.id_vehicule
                AND existante.id_location <> nouvelle.id_location
              WHERE nouvelle.id_location = NEW.id_location
                AND existante.statut IN ('EN_COURS', 'EN_RETARD')
                AND existante.date_debut < nouvelle.date_fin_prevue
                AND COALESCE(existante.date_retour_reelle, existante.date_fin_prevue) > nouvelle.date_debut
           )
         ) THEN
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
DELIMITER ;
