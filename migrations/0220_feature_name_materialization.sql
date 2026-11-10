-- Refs #241: localized naming inputs belong to featureI18n; title is a write projection.
-- Immutable revision content/hashes are intentionally untouched.
ALTER TABLE featureI18n ADD COLUMN baseName TEXT;
ALTER TABLE featureI18n ADD COLUMN nameOverride TEXT;

-- Open only missing scopes for this schema conversion, retaining any existing scopes.
INSERT INTO featureRevisionWriteScope(featureId,token)
SELECT DISTINCT featureId,'0220_feature_name_materialization' FROM featureRevision
WHERE featureId NOT IN (SELECT featureId FROM featureRevisionWriteScope);

-- Match retained locale aliases while preserving explicit empty bases and overrides.
UPDATE featureI18n SET
  baseName=COALESCE((SELECT n.value FROM feature f,json_each(json_extract(f.nameTemplate,'$.baseNames')) n
    WHERE f.id=featureId AND lower(replace(n.key,'-',''))=lower(replace(locale,'-','')) LIMIT 1),title),
  nameOverride=(SELECT n.value FROM feature f,json_each(json_extract(f.nameTemplate,'$.overrides')) n
    WHERE f.id=featureId AND lower(replace(n.key,'-',''))=lower(replace(locale,'-','')) LIMIT 1);
UPDATE feature SET nameTemplate=json_object('rule',json(json_extract(nameTemplate,'$.rule')))
  WHERE nameTemplate IS NOT NULL;

-- Generated from featureLocationNamesSQL: accepted facts/shared pins and Organisation choices,
-- including clears, follow freshness, draft visibility and manual-owner access boundaries.
CREATE VIEW featureAcceptedNamingLocation AS
SELECT feature.id featureId, (SELECT json_patch(
    COALESCE(CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN json_extract(pr.facts,'$.common.names') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN json_extract(pr.facts,'$.common.names') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END, '{}'),
    (SELECT json_group_object(name.key, CASE json_extract(name.value,'$.mode')
      WHEN 'override' THEN json_extract(name.value,'$.value') ELSE NULL END)
      FROM json_each(CASE WHEN json_extract(fp.acceptedOverrides,'$.freshness.names.mode')='follow' AND json_extract(fp.acceptedOverrides,'$.freshness.names.original') IS NOT CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN json_extract(pr.facts,'$.common.names') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN json_extract(pr.facts,'$.common.names') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END THEN NULL ELSE json_extract(fp.acceptedOverrides,'$.names') END) name
      WHERE json_extract(name.value,'$.mode') IN ('override','clear')))
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevision pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (json_type(pr.facts,'$.schemaVersion') IS NULL OR json_extract(pr.facts,'$.schemaVersion')=1)
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))) names FROM feature;

-- A correlated recursive fold preserves rule order and bounded per-feature work.
-- Readers consume featureI18n.title directly; only write triggers use this view.
CREATE VIEW featureComputedName AS
SELECT i.featureId,i.locale,
  CASE WHEN f.nameTemplate IS NULL THEN COALESCE(i.baseName,i.title,'')
    WHEN i.nameOverride IS NOT NULL THEN i.nameOverride
    ELSE (WITH RECURSIVE
      parts AS (
        SELECT CAST(c.key AS INTEGER) n,
          trim(COALESCE(json_extract(l.value,CASE
            WHEN p.dataType='boolean' AND p.audience='public' AND v.value IN ('true','1') THEN '$.true'
            WHEN p.dataType='boolean' AND p.audience='public' AND v.value IN ('false','0') THEN '$.false'
            ELSE '$.null' END),''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) part,
          json_extract(l.value,'$.placement') placement,
          COALESCE(json_extract(l.value,'$.separator'),'') separator
        FROM json_each(json_extract(f.nameTemplate,'$.rule.conditions')) c
        LEFT JOIN json_each(json_extract(c.value,'$.locales')) l
          ON l.key=(SELECT key FROM json_each(json_extract(c.value,'$.locales'))
            WHERE lower(replace(key,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1)
        LEFT JOIN property p ON p.id=json_extract(c.value,'$.propertyId')
        LEFT JOIN featureProperty v ON v.featureId=f.id AND v.propertyId=p.id
      ),
      fold(n,name,resolved) AS (
        SELECT 0,CASE json_extract(f.nameTemplate,'$.rule.base') WHEN 'location' THEN
          COALESCE((SELECT value FROM json_each((SELECT names FROM featureAcceptedNamingLocation WHERE featureId=f.id))
            WHERE lower(replace(key,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1),'')
          ELSE COALESCE(i.baseName,i.title,'') END,1
        UNION ALL
        SELECT fold.n+1,CASE WHEN name='' OR resolved=0 THEN '' WHEN part='' THEN name
          WHEN placement='prefix' THEN part||separator||name ELSE name||separator||part END,
          CASE WHEN name='' THEN 0 ELSE resolved END
        FROM fold JOIN parts ON parts.n=fold.n
      ) SELECT name FROM fold ORDER BY n DESC LIMIT 1)
  END title
FROM featureI18n i JOIN feature f ON f.id=i.featureId;

-- Initialize new rows from legacy title-only import payloads; subsequent writes own baseName.
CREATE TRIGGER feature_name_insert AFTER INSERT ON featureI18n BEGIN
  UPDATE featureI18n SET baseName=COALESCE(NEW.baseName,NEW.title,'')
    WHERE featureId=NEW.featureId AND locale=NEW.locale;
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=NEW.featureId AND n.locale=NEW.locale)
    WHERE featureId=NEW.featureId AND locale=NEW.locale;
END;
CREATE TRIGGER feature_name_input AFTER UPDATE OF baseName,nameOverride,title ON featureI18n
WHEN NEW.title IS NOT (SELECT title FROM featureComputedName n WHERE n.featureId=NEW.featureId AND n.locale=NEW.locale)
BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=NEW.featureId AND n.locale=NEW.locale)
    WHERE featureId=NEW.featureId AND locale=NEW.locale;
END;

CREATE TRIGGER feature_name_feature_update AFTER UPDATE OF nameTemplate,isDraft,projectId ON feature BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=NEW.id;
END;

CREATE TRIGGER feature_name_featureProperty_insert AFTER INSERT ON featureProperty BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=NEW.featureId;
END;

CREATE TRIGGER feature_name_featureProperty_update AFTER UPDATE ON featureProperty BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=NEW.featureId OR featureId=OLD.featureId;
END;

CREATE TRIGGER feature_name_featureProperty_delete AFTER DELETE ON featureProperty BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=OLD.featureId;
END;

CREATE TRIGGER feature_name_featureLocation_insert AFTER INSERT ON featureLocation BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=NEW.featureId;
END;

CREATE TRIGGER feature_name_featureLocation_update AFTER UPDATE ON featureLocation BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=NEW.featureId OR featureId=OLD.featureId;
END;

CREATE TRIGGER feature_name_featureLocation_delete AFTER DELETE ON featureLocation BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId=OLD.featureId;
END;

CREATE TRIGGER feature_name_property_update AFTER UPDATE OF audience,dataType ON property BEGIN
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE featureId IN (SELECT featureId FROM featureProperty WHERE propertyId=NEW.id);
END;

-- Backfill computed/searchable titles after all inputs have moved.
  UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
    WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
    WHERE 1;

DELETE FROM featureRevisionWriteScope WHERE token='0220_feature_name_materialization';

-- Derived titles may refresh without forging an authored revision. Every authored column
-- and any non-derived title replacement retain the existing revision-scope requirement.
DROP TRIGGER IF EXISTS feature_revision_guard_featureI18n_update;
CREATE TRIGGER feature_revision_guard_featureI18n_update BEFORE UPDATE ON featureI18n
WHEN (NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale
 OR NEW.baseName IS NOT OLD.baseName OR NEW.nameOverride IS NOT OLD.nameOverride
 OR NEW.titleGen IS NOT OLD.titleGen OR NEW.description IS NOT OLD.description
 OR NEW.descriptionGen IS NOT OLD.descriptionGen OR NEW.displayAddress IS NOT OLD.displayAddress
 OR NEW.displayAddressGen IS NOT OLD.displayAddressGen OR NEW.addressProperties IS NOT OLD.addressProperties
 OR NEW.title IS NOT (SELECT title FROM featureComputedName WHERE featureId=OLD.featureId AND locale=OLD.locale)) AND (
 (EXISTS(SELECT 1 FROM featureRevision WHERE featureId=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
 OR (EXISTS(SELECT 1 FROM featureRevision WHERE featureId=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId)))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;

CREATE TRIGGER feature_name_location_scope AFTER UPDATE OF state,ownerOrganisationId ON location BEGIN
 UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
 WHERE featureId IN (SELECT featureId FROM featureLocation WHERE locationId=NEW.id);
END;

CREATE TRIGGER feature_name_project_scope AFTER UPDATE OF organisationId ON project BEGIN
 UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
 WHERE featureId IN (SELECT id FROM feature WHERE projectId=NEW.id);
END;
