-- Refs #194. Canonical drafts have one mutable working baseline, frozen on publication.
-- Published snapshots and their translations retain their existing immutable guards.
CREATE TABLE locationCanonicalDraftWriteScope(revisionId TEXT PRIMARY KEY NOT NULL);
DROP TRIGGER location_revision_no_update;
CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
WHEN NOT (EXISTS(SELECT 1 FROM locationCanonicalDraftWriteScope WHERE revisionId=OLD.id) AND EXISTS(SELECT 1 FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
 WHERE l.id=OLD.locationId AND l.state='unresolved' AND l.ssId IS NULL
 AND l.ownerOrganisationId IS NULL AND OLD.origin='local'
 AND OLD.id=(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)))
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;

DROP TRIGGER location_revision_i18n_guard_delete;
CREATE TRIGGER location_revision_i18n_guard_delete BEFORE DELETE ON locationRevisionI18n
WHEN NOT EXISTS(SELECT 1 FROM locationCanonicalDraftWriteScope WHERE revisionId=OLD.revisionId)
BEGIN SELECT RAISE(ABORT,'Location translations are immutable'); END;

CREATE TRIGGER location_canonical_draft_update INSTEAD OF UPDATE ON locationRevisionContent BEGIN
 SELECT CASE WHEN NOT (EXISTS(SELECT 1 FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
 WHERE l.id=OLD.locationId AND l.state='unresolved' AND l.ssId IS NULL
 AND l.ownerOrganisationId IS NULL AND OLD.origin='local'
 AND OLD.id=(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)))
 OR NEW.id IS NOT OLD.id OR NEW.locationId IS NOT OLD.locationId
 OR NEW.version IS NOT OLD.version OR NEW.origin IS NOT OLD.origin
 OR NEW.ssId IS NOT OLD.ssId OR NEW.apiVersion IS NOT OLD.apiVersion
 OR NEW.releaseId IS NOT OLD.releaseId OR NEW.snapshotId IS NOT OLD.snapshotId
 OR NEW.rawSource IS NOT OLD.rawSource OR NEW.createdAt IS NOT OLD.createdAt
 THEN RAISE(ABORT,'Only canonical draft content is mutable') END;
 SELECT CASE WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
 OR coalesce(json_extract(NEW.facts,'$.kind') IN ('unknown','premises','establishment','building','building_part','natural','address','infrastructure','street','built','structure','landform','coastal_feature','water_feature','service_point','premises_address','cadastral_address','linear_reference'),0)=0
 OR json_type(NEW.facts,'$.i18n') IS NOT 'object'
 OR json_type(NEW.facts,'$.common') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.location') IS NOT 'object'
 OR json_type(NEW.facts,'$.details') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.names') IS NOT NULL
 OR json_type(NEW.facts,'$.common.location.address.fallbackDisplay') IS NOT NULL
 OR json_type(NEW.facts,'$.common.location.address.displayOverrides') IS NOT NULL
 OR json_type(NEW.facts,'$.details.branch') IS NOT NULL
 OR json_type(NEW.facts,'$.details.format') IS NOT NULL
 OR EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.i18n') t WHERE t.type!='object' OR EXISTS(SELECT 1 FROM json_each(t.value) f WHERE f.key NOT IN ('name','branch','format','displayAddress','displayAddressOverride') OR f.type!='text'))
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND (json_type(NEW.facts,'$.details.brands') IS NOT 'array' OR EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.details.brands') b WHERE json_type(b.value,'$.i18n') IS NOT 'object' OR json_type(b.value,'$.names') IS NOT NULL))) THEN RAISE(ABORT,'Location revisions require locale-first i18n input') END;

 INSERT INTO locationCanonicalDraftWriteScope VALUES(OLD.id);
 INSERT INTO locationRevisionWriteScope VALUES(OLD.id);
 UPDATE locationRevision SET facts=json_remove(NEW.facts,'$.i18n'),contentHash=NEW.contentHash WHERE id=OLD.id;
 DELETE FROM locationRevisionI18n WHERE revisionId=OLD.id;
 INSERT INTO locationRevisionI18n SELECT NEW.id,t.key,json_extract(t.value,'$.name'),json_extract(t.value,'$.branch'),json_extract(t.value,'$.format'),json_extract(t.value,'$.displayAddress'),json_extract(t.value,'$.displayAddressOverride') FROM json_each(NEW.facts,'$.i18n') t;
 DELETE FROM locationRevisionWriteScope WHERE revisionId=OLD.id;
 DELETE FROM locationCanonicalDraftWriteScope WHERE revisionId=OLD.id;
END;
