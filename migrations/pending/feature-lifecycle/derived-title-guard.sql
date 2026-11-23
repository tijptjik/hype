-- Repair already-converted local lifecycle databases; requires currentRevisionId and naming inputs.
DROP TRIGGER feature_revision_guard_featureI18n_update;
-- Refs #194: derived title refreshes retain attribution guards for all authored fields.
CREATE TRIGGER feature_revision_guard_featureI18n_update BEFORE UPDATE ON featureI18n
WHEN (NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale
 OR NEW.baseName IS NOT OLD.baseName OR NEW.nameOverride IS NOT OLD.nameOverride
 OR NEW.titleGen IS NOT OLD.titleGen OR NEW.description IS NOT OLD.description
 OR NEW.descriptionGen IS NOT OLD.descriptionGen OR NEW.displayAddress IS NOT OLD.displayAddress
 OR NEW.displayAddressGen IS NOT OLD.displayAddressGen OR NEW.addressProperties IS NOT OLD.addressProperties
 OR NEW.isAutomaticOnly IS NOT OLD.isAutomaticOnly OR NEW.autoTranslated IS NOT OLD.autoTranslated
 OR NEW.translationProvenance IS NOT OLD.translationProvenance
 OR NEW.title IS NOT (SELECT title FROM featureComputedName WHERE featureId=OLD.featureId AND locale=OLD.locale)) AND (
 (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
 OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId)))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
