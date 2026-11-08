SET @schema_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name
     AND TABLE_NAME = 'location'
     AND COLUMN_NAME = 'mode_paiement_import'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE location ADD COLUMN mode_paiement_import VARCHAR(80) NULL AFTER observation',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name
     AND TABLE_NAME = 'location'
     AND COLUMN_NAME = 'reference_facture_import'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE location ADD COLUMN reference_facture_import VARCHAR(30) NULL AFTER mode_paiement_import',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name
     AND TABLE_NAME = 'location'
     AND COLUMN_NAME = 'date_facturation_import'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE location ADD COLUMN date_facturation_import DATE NULL AFTER reference_facture_import',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name
     AND TABLE_NAME = 'location'
     AND COLUMN_NAME = 'date_paiement_import'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE location ADD COLUMN date_paiement_import DATE NULL AFTER date_facturation_import',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name
     AND TABLE_NAME = 'location'
     AND COLUMN_NAME = 'paye_import'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE location ADD COLUMN paye_import VARCHAR(10) NULL AFTER date_paiement_import',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
