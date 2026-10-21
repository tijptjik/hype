-- Refs #194. Accepted correction tokens must remain in their Organisation's namespace.
-- History is retained on redirects and copied during reviewed merges; it is never transferred by a Feature/Project move.
CREATE TRIGGER feature_location_organisation_insert BEFORE INSERT ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId
 JOIN feature f ON f.projectId=pr.id, json_each(o.history) h
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId
 AND json_extract(h.value,'$.revision')=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId
 JOIN feature f ON f.projectId=pr.id, json_each(o.history) h
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId
 AND json_extract(h.value,'$.revision')=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;

CREATE TRIGGER feature_location_organisation_update BEFORE UPDATE ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId
 JOIN feature f ON f.projectId=pr.id, json_each(o.history) h
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId
 AND json_extract(h.value,'$.revision')=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId
 JOIN feature f ON f.projectId=pr.id, json_each(o.history) h
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId
 AND json_extract(h.value,'$.revision')=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;

CREATE TRIGGER feature_location_organisation_feature_move BEFORE UPDATE OF projectId ON feature
WHEN NEW.projectId IS NOT OLD.projectId AND EXISTS (
 SELECT 1 FROM featureLocation fp WHERE fp.featureId=OLD.id
 AND (fp.factsOrganisationRevision IS NOT NULL OR fp.locationOrganisationRevision IS NOT NULL)
 AND (SELECT organisationId FROM project WHERE id=OLD.projectId) IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch: reconcile accepted Organisation corrections before moving the Feature'); END;

CREATE TRIGGER feature_location_organisation_project_move BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
 SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id WHERE f.projectId=OLD.id
 AND (fp.factsOrganisationRevision IS NOT NULL OR fp.locationOrganisationRevision IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch: reconcile accepted Organisation corrections before moving the Project'); END;
