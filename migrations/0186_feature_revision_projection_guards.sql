-- Fail closed for enrolled identities when a legacy helper/importer attempts an unaudited write.
-- No identities are enrolled by this migration; live visibility and derived indexes stay independent.
CREATE TABLE featureRevisionWriteScope (
 featureId TEXT PRIMARY KEY NOT NULL REFERENCES featureRevisionHead(featureId),
 token TEXT NOT NULL
);
CREATE TRIGGER feature_revision_projection_update BEFORE UPDATE ON feature
WHEN (NEW.geometry IS NOT OLD.geometry OR NEW.addressMeta IS NOT OLD.addressMeta OR NEW.isIntangible IS NOT OLD.isIntangible OR NEW.isVisitable IS NOT OLD.isVisitable OR NEW.visitableAsOf IS NOT OLD.visitableAsOf OR NEW.localLocationBrands IS NOT OLD.localLocationBrands) AND EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.id)
BEGIN SELECT RAISE(ABORT,'Feature content requires an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureI18n_insert BEFORE INSERT ON featureI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureI18n_update BEFORE UPDATE ON featureI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureI18n_delete BEFORE DELETE ON featureI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_insert BEFORE INSERT ON featureProperty
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_update BEFORE UPDATE ON featureProperty
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_delete BEFORE DELETE ON featureProperty
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_insert BEFORE INSERT ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_update BEFORE UPDATE ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_delete BEFORE DELETE ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_insert BEFORE INSERT ON featureImage
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_update BEFORE UPDATE ON featureImage
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_delete BEFORE DELETE ON featureImage
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_insert BEFORE INSERT ON featureLocation
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_update BEFORE UPDATE ON featureLocation
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_delete BEFORE DELETE ON featureLocation
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_insert BEFORE INSERT ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_update BEFORE UPDATE ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_delete BEFORE DELETE ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
