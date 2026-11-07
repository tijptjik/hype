-- Refs #194. Flatten corrections without changing any accepted version token.
-- Abort on ambiguous history; do not silently discard or reorder retained assertions.
CREATE TABLE _location_correction_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _location_correction_guard SELECT NOT EXISTS(
 SELECT 1 FROM organisationLocation o WHERE json_array_length(o.history)=0
 OR json_extract(o.history,'$[#-1].revision') IS NOT o.revision
 OR json_extract(o.history,'$[#-1].overrides') IS NOT json(o.overrides)
 OR json_extract(o.history,'$[#-1].actorId') IS NOT o.actorId
);
CREATE TABLE _organisationLocationRows (
 id TEXT PRIMARY KEY NOT NULL,
 organisationId TEXT NOT NULL REFERENCES organisation(id),
 locationId TEXT NOT NULL REFERENCES location(id),
 previousRevisionId TEXT REFERENCES _organisationLocationRows(id),
 overrides TEXT NOT NULL CHECK(json_valid(overrides)),
 provenance TEXT CHECK(provenance IS NULL OR json_valid(provenance)),
 actorId TEXT NOT NULL,
 createdAt TEXT NOT NULL
);
INSERT INTO _organisationLocationRows
 SELECT json_extract(h.value,'$.revision'),o.organisationId,o.locationId,
 CASE WHEN h.key=0 THEN NULL ELSE json_extract(o.history,'$['||(h.key-1)||'].revision') END,
 json_extract(h.value,'$.overrides'),json_extract(h.value,'$.provenance'),
 json_extract(h.value,'$.actorId'),json_extract(h.value,'$.createdAt')
 FROM organisationLocation o,json_each(o.history) h;
INSERT INTO _location_correction_guard SELECT
 (SELECT count(*) FROM _organisationLocationRows)=(SELECT COALESCE(sum(json_array_length(history)),0) FROM organisationLocation);
DROP TRIGGER feature_location_organisation_insert;
DROP TRIGGER feature_location_organisation_update;
DROP TABLE organisationLocation;
ALTER TABLE _organisationLocationRows RENAME TO organisationLocation;
CREATE UNIQUE INDEX organisation_location_root ON organisationLocation(organisationId,locationId) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX organisation_location_successor ON organisationLocation(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE INDEX organisation_location_pair ON organisationLocation(organisationId,locationId);
CREATE VIEW organisationLocationHead AS SELECT o.*,o.id AS revision FROM organisationLocation o
 WHERE NOT EXISTS(SELECT 1 FROM organisationLocation n WHERE n.previousRevisionId=o.id);
CREATE TRIGGER organisation_location_chain BEFORE INSERT ON organisationLocation
 WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organisationLocation p WHERE p.id=NEW.previousRevisionId AND p.organisationId=NEW.organisationId AND p.locationId=NEW.locationId)
 BEGIN SELECT RAISE(ABORT,'Organisation correction predecessor scope mismatch'); END;
CREATE TRIGGER organisation_location_no_update BEFORE UPDATE ON organisationLocation
 BEGIN SELECT RAISE(ABORT,'Organisation corrections are immutable'); END;
CREATE TRIGGER organisation_location_no_delete BEFORE DELETE ON organisationLocation
 BEGIN SELECT RAISE(ABORT,'Organisation corrections are retained'); END;
CREATE TRIGGER organisation_location_scope_insert BEFORE INSERT ON organisationLocation
 WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state!='redirect' AND (state!='manual' OR ownerOrganisationId=NEW.organisationId))
 BEGIN SELECT RAISE(ABORT,'Organisation Location scope mismatch'); END;
CREATE TRIGGER organisation_location_change_insert AFTER INSERT ON organisationLocation
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,status,origin,organisationId,organisationRevision,actorId)
 VALUES('local:'||NEW.id,NEW.locationId,NULL,'pending','local',NEW.organisationId,NEW.id,NEW.actorId); END;
CREATE TRIGGER feature_location_organisation_insert BEFORE INSERT ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;
CREATE TRIGGER feature_location_organisation_update BEFORE UPDATE ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;
DROP TABLE _location_correction_guard;
