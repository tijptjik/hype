-- Refs #194. Translation rows are authoritative; views assemble content without storing copies.
DROP TRIGGER location_revision_i18n_insert;
DROP TRIGGER location_revision_snapshot_insert;
DROP TRIGGER location_revision_no_update;
UPDATE locationRevision SET facts=json_remove(facts,'$.i18n');
CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;
CREATE TABLE locationRevisionWriteScope(revisionId TEXT PRIMARY KEY NOT NULL);
CREATE VIEW locationRevisionContent AS SELECT r.id,r.locationId,r.version,r.origin,r.ssId,r.apiVersion,r.releaseId,r.snapshotId,r.contentHash,r.rawSource,json_set(r.facts,'$.i18n',json((SELECT json_group_object(t.locale,json(json_patch(json_patch(json_patch(json_patch(json_patch('{}',CASE WHEN t.name IS NULL THEN '{}' ELSE json_object('name',t.name) END),CASE WHEN t.branch IS NULL THEN '{}' ELSE json_object('branch',t.branch) END),CASE WHEN t.format IS NULL THEN '{}' ELSE json_object('format',t.format) END),CASE WHEN t.displayAddress IS NULL THEN '{}' ELSE json_object('displayAddress',t.displayAddress) END),CASE WHEN t.displayAddressOverride IS NULL THEN '{}' ELSE json_object('displayAddressOverride',t.displayAddressOverride) END))) FROM locationRevisionI18n t WHERE t.revisionId=r.id))) AS facts,r.createdAt FROM locationRevision r;
CREATE TRIGGER location_revision_content_insert INSTEAD OF INSERT ON locationRevisionContent BEGIN
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
 INSERT INTO locationRevisionWriteScope VALUES(NEW.id);
 INSERT INTO locationRevision(id,locationId,version,origin,ssId,apiVersion,releaseId,snapshotId,contentHash,rawSource,facts,createdAt) VALUES(NEW.id,NEW.locationId,NEW.version,NEW.origin,NEW.ssId,NEW.apiVersion,NEW.releaseId,NEW.snapshotId,NEW.contentHash,NEW.rawSource,json_remove(NEW.facts,'$.i18n'),coalesce(NEW.createdAt,strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 INSERT INTO locationRevisionI18n SELECT NEW.id,t.key,json_extract(t.value,'$.name'),json_extract(t.value,'$.branch'),json_extract(t.value,'$.format'),json_extract(t.value,'$.displayAddress'),json_extract(t.value,'$.displayAddressOverride') FROM json_each(NEW.facts,'$.i18n') t;
 DELETE FROM locationRevisionWriteScope WHERE revisionId=NEW.id;
END;
CREATE TRIGGER location_revision_storage_insert BEFORE INSERT ON locationRevision
WHEN json_type(NEW.facts,'$.i18n') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM locationRevisionWriteScope WHERE revisionId=NEW.id)
BEGIN SELECT RAISE(ABORT,'Write complete Location revisions through locationRevisionContent'); END;
CREATE TRIGGER location_revision_i18n_guard_insert BEFORE INSERT ON locationRevisionI18n
WHEN NOT EXISTS(SELECT 1 FROM locationRevisionWriteScope WHERE revisionId=NEW.revisionId)
BEGIN SELECT RAISE(ABORT,'Location translations belong to their immutable revision'); END;
CREATE TRIGGER location_revision_i18n_guard_update BEFORE UPDATE ON locationRevisionI18n
BEGIN SELECT RAISE(ABORT,'Location translations are immutable'); END;
CREATE TRIGGER location_revision_i18n_guard_delete BEFORE DELETE ON locationRevisionI18n
BEGIN SELECT RAISE(ABORT,'Location translations are immutable'); END;

DROP TRIGGER identity_catalogue_i18n_revision;
DROP TRIGGER identity_catalogue_i18n_head;
DROP TABLE identityCatalogueI18n;
CREATE TABLE identityCatalogueI18n (
 catalogueId TEXT NOT NULL,
 version INTEGER NOT NULL,
 locale TEXT NOT NULL,
 name TEXT NOT NULL,
 PRIMARY KEY(catalogueId,version,locale),
 FOREIGN KEY(catalogueId,version) REFERENCES identityCatalogueRevision(catalogueId,version)
);
CREATE INDEX identity_catalogue_i18n_name ON identityCatalogueI18n(name COLLATE NOCASE,catalogueId,version);
INSERT INTO identityCatalogueI18n SELECT r.catalogueId,r.version,t.key,json_extract(t.value,'$.name') FROM identityCatalogueRevision r,json_each(r.content,'$.i18n') t;
DROP TRIGGER identity_catalogue_revision_immutable_update;
UPDATE identityCatalogueRevision SET content=json_remove(content,'$.i18n');
CREATE TRIGGER identity_catalogue_revision_immutable_update BEFORE UPDATE ON identityCatalogueRevision
BEGIN SELECT RAISE(ABORT,'Catalogue revisions are immutable'); END;
CREATE TABLE identityCatalogueWriteScope(catalogueId TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(catalogueId,version));
CREATE VIEW identityCatalogueRevisionContent AS SELECT r.catalogueId,r.version,json_set(r.content,'$.i18n',json((SELECT json_group_object(t.locale,json_object('name',t.name)) FROM identityCatalogueI18n t WHERE t.catalogueId=r.catalogueId AND t.version=r.version))) content,r.actorId,r.createdAt FROM identityCatalogueRevision r;
CREATE TRIGGER identity_catalogue_content_insert INSTEAD OF INSERT ON identityCatalogueRevisionContent BEGIN
 SELECT CASE WHEN json_type(NEW.content,'$.i18n') IS NOT 'object' OR EXISTS(SELECT 1 FROM json_each(NEW.content,'$.i18n') t WHERE t.type!='object' OR json_type(t.value,'$.name') IS NOT 'text') THEN RAISE(ABORT,'Catalogue names require locale-first input') END;
 INSERT INTO identityCatalogueWriteScope VALUES(NEW.catalogueId,NEW.version);
 INSERT INTO identityCatalogueRevision VALUES(NEW.catalogueId,NEW.version,json_remove(NEW.content,'$.i18n'),NEW.actorId,NEW.createdAt);
 INSERT INTO identityCatalogueI18n SELECT NEW.catalogueId,NEW.version,t.key,json_extract(t.value,'$.name') FROM json_each(NEW.content,'$.i18n') t;
 DELETE FROM identityCatalogueWriteScope WHERE catalogueId=NEW.catalogueId AND version=NEW.version;
END;
CREATE TRIGGER identity_catalogue_storage_insert BEFORE INSERT ON identityCatalogueRevision
WHEN json_type(NEW.content,'$.i18n') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM identityCatalogueWriteScope WHERE catalogueId=NEW.catalogueId AND version=NEW.version)
BEGIN SELECT RAISE(ABORT,'Write complete catalogue revisions through identityCatalogueRevisionContent'); END;
CREATE TRIGGER identity_catalogue_i18n_guard_insert BEFORE INSERT ON identityCatalogueI18n
WHEN NOT EXISTS(SELECT 1 FROM identityCatalogueWriteScope WHERE catalogueId=NEW.catalogueId AND version=NEW.version)
BEGIN SELECT RAISE(ABORT,'Catalogue translations belong to their immutable revision'); END;
CREATE TRIGGER identity_catalogue_i18n_guard_update BEFORE UPDATE ON identityCatalogueI18n
BEGIN SELECT RAISE(ABORT,'Catalogue translations are immutable'); END;
CREATE TRIGGER identity_catalogue_i18n_guard_delete BEFORE DELETE ON identityCatalogueI18n
BEGIN SELECT RAISE(ABORT,'Catalogue translations are immutable'); END;

DROP VIEW featureAcceptedNamingLocation;
CREATE VIEW featureAcceptedNamingLocation AS
SELECT feature.id featureId, (SELECT json_patch(
    COALESCE(CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END, '{}'),
    (SELECT json_group_object(name.key, CASE json_extract(name.value,'$.mode')
      WHEN 'override' THEN json_extract(name.value,'$.value') ELSE NULL END)
      FROM json_each(CASE WHEN json_extract(fp.acceptedOverrides,'$.freshness.names.mode')='follow' AND json_extract(fp.acceptedOverrides,'$.freshness.names.original') IS NOT CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END THEN NULL ELSE json_extract(fp.acceptedOverrides,'$.names') END) name
      WHERE json_extract(name.value,'$.mode') IN ('override','clear')))
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevisionContent pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (json_type(pr.facts,'$.schemaVersion') IS NULL OR json_extract(pr.facts,'$.schemaVersion')=1)
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))) names FROM feature;
