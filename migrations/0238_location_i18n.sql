-- Refs #178. Pre-release normalization: retain raw publisher evidence, replace the draft content layout.
DROP TRIGGER location_revision_no_update;
DROP TRIGGER location_revision_snapshot_insert;
UPDATE locationRevision SET facts=json_remove(json_set(facts,'$.i18n',json((
 SELECT json_group_object(locale,json(fields)) FROM (
  SELECT locale,json_patch(json_patch(
   CASE WHEN json_type(locationRevision.facts,'$.common.names.'||json_quote(locale))='text' THEN json_object('name',json_extract(locationRevision.facts,'$.common.names.'||json_quote(locale))) ELSE '{}' END,
   CASE WHEN json_type(locationRevision.facts,'$.details.branch.'||json_quote(locale))='text' THEN json_object('branch',json_extract(locationRevision.facts,'$.details.branch.'||json_quote(locale))) ELSE '{}' END),
   CASE WHEN json_type(locationRevision.facts,'$.details.format.'||json_quote(locale))='text' THEN json_object('format',json_extract(locationRevision.facts,'$.details.format.'||json_quote(locale))) ELSE '{}' END) fields
  FROM (SELECT key locale FROM json_each(locationRevision.facts,'$.common.names') UNION SELECT key FROM json_each(locationRevision.facts,'$.details.branch') UNION SELECT key FROM json_each(locationRevision.facts,'$.details.format'))
 )))),'$.common.names','$.details.branch','$.details.format');
UPDATE locationRevision SET facts=json_set(facts,'$.details.brands',json((
 SELECT json_group_array(json_object('identifiers',json_extract(b.value,'$.identifiers'),'i18n',json((SELECT json_group_object(n.key,json_object('name',n.value)) FROM json_each(b.value,'$.names') n)))) FROM json_each(locationRevision.facts,'$.details.brands') b
))) WHERE json_extract(facts,'$.kind')='establishment';
-- Address labels are translated content too; raw address publisher payloads remain unchanged.
UPDATE locationRevision SET facts=json_remove(json_set(facts,'$.i18n',json((
 SELECT json_group_object(locale,json(json_patch(json_patch(
  coalesce(json_extract(locationRevision.facts,'$.i18n.'||json_quote(locale)),'{}'),
  CASE WHEN json_type(locationRevision.facts,'$.common.location.address.fallbackDisplay.'||json_quote(locale))='text' THEN json_object('displayAddress',json_extract(locationRevision.facts,'$.common.location.address.fallbackDisplay.'||json_quote(locale))) ELSE '{}' END),
  CASE WHEN json_type(locationRevision.facts,'$.common.location.address.displayOverrides.'||json_quote(locale))='text' THEN json_object('displayAddressOverride',json_extract(locationRevision.facts,'$.common.location.address.displayOverrides.'||json_quote(locale))) ELSE '{}' END)))
 FROM (SELECT key locale FROM json_each(locationRevision.facts,'$.i18n') UNION SELECT key FROM json_each(locationRevision.facts,'$.common.location.address.fallbackDisplay') UNION SELECT key FROM json_each(locationRevision.facts,'$.common.location.address.displayOverrides'))
))),'$.common.location.address.fallbackDisplay','$.common.location.address.displayOverrides');
CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;
CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
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
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND (json_type(NEW.facts,'$.details.brands') IS NOT 'array' OR EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.details.brands') b WHERE json_type(b.value,'$.i18n') IS NOT 'object' OR json_type(b.value,'$.names') IS NOT NULL)))
BEGIN SELECT RAISE(ABORT,'Location revisions require locale-first i18n content'); END;

-- Relational translations support search/filtering without opening revision JSON per candidate.
CREATE TABLE locationRevisionI18n (
 revisionId TEXT NOT NULL REFERENCES locationRevision(id),
 locale TEXT NOT NULL,
 name TEXT,
 branch TEXT,
 format TEXT,
 displayAddress TEXT,
 displayAddressOverride TEXT,
 PRIMARY KEY(revisionId,locale)
);
CREATE INDEX location_revision_i18n_name ON locationRevisionI18n(name COLLATE NOCASE,revisionId);
CREATE INDEX location_revision_i18n_branch ON locationRevisionI18n(branch COLLATE NOCASE,revisionId);
INSERT INTO locationRevisionI18n SELECT r.id,t.key,json_extract(t.value,'$.name'),json_extract(t.value,'$.branch'),json_extract(t.value,'$.format'),json_extract(t.value,'$.displayAddress'),json_extract(t.value,'$.displayAddressOverride') FROM locationRevision r,json_each(r.facts,'$.i18n') t;
CREATE TRIGGER location_revision_i18n_insert AFTER INSERT ON locationRevision BEGIN
 INSERT INTO locationRevisionI18n SELECT NEW.id,t.key,json_extract(t.value,'$.name'),json_extract(t.value,'$.branch'),json_extract(t.value,'$.format'),json_extract(t.value,'$.displayAddress'),json_extract(t.value,'$.displayAddressOverride') FROM json_each(NEW.facts,'$.i18n') t;
END;
DROP VIEW featureAcceptedNamingLocation;
CREATE VIEW featureAcceptedNamingLocation AS
SELECT feature.id featureId, (SELECT json_patch(
    COALESCE(CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END, '{}'),
    (SELECT json_group_object(name.key, CASE json_extract(name.value,'$.mode')
      WHEN 'override' THEN json_extract(name.value,'$.value') ELSE NULL END)
      FROM json_each(CASE WHEN json_extract(fp.acceptedOverrides,'$.freshness.names.mode')='follow' AND json_extract(fp.acceptedOverrides,'$.freshness.names.original') IS NOT CASE WHEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.supersededBy') IS NULL THEN CASE json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.mode') WHEN 'override' THEN json_extract((SELECT json_extract(s.corrections,'$.names') FROM locationSharedRevision s WHERE s.id=CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')='names') ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END AND s.locationId=fp.locationId),'$.choice.value') WHEN 'clear' THEN '{}' ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END ELSE CASE json_extract(pr.facts,'$.schemaVersion') WHEN 1 THEN (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(pr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') ELSE CASE WHEN json_type(pr.facts,'$.schemaVersion') IS NULL THEN json_extract(pr.facts,'$.names') END END END THEN NULL ELSE json_extract(fp.acceptedOverrides,'$.names') END) name
      WHERE json_extract(name.value,'$.mode') IN ('override','clear')))
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevision pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (json_type(pr.facts,'$.schemaVersion') IS NULL OR json_extract(pr.facts,'$.schemaVersion')=1)
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))) names FROM feature;

