-- Refs #241. Locally authorable street and infrastructure identities; no automatic reclassification.
DROP TRIGGER locationMembership_part_owner;
-- Temporarily remove kind-dependent schema objects while widening the inline CHECK.
DROP TRIGGER feature_location_grouping_insert;
DROP TRIGGER feature_location_grouping_update;
DROP TRIGGER locationMembership_kinds;
DROP TRIGGER locationOccupancy_kinds;
DROP TRIGGER location_accessibility_insert;
DROP TRIGGER location_relationship_kind_update;
DROP TRIGGER location_revision_snapshot_insert;
DROP TRIGGER location_revision_unknown_details;
DROP VIEW locationRematchEligible;
DROP VIEW locationRematchCurrent;
ALTER TABLE location ADD COLUMN nextKind TEXT NOT NULL DEFAULT 'unknown'
 CHECK(nextKind IN ('unknown','premises','establishment','building','building_part','address','natural','infrastructure','street'));
UPDATE location SET nextKind=kind;
ALTER TABLE location DROP COLUMN kind;
ALTER TABLE location RENAME COLUMN nextKind TO kind;
CREATE TRIGGER feature_location_grouping_insert AFTER INSERT ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.version,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 -- Accepted ancestry still projects building/premises roles; intermediate parts retain exact revision pins.
 SELECT NEW.featureId,parent.id,parent.kind,NEW.version,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE parent.kind IN ('building','premises') GROUP BY parent.id,parent.kind;
 END;

CREATE TRIGGER feature_location_grouping_update AFTER UPDATE ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.version,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 -- Accepted ancestry still projects building/premises roles; intermediate parts retain exact revision pins.
 SELECT NEW.featureId,parent.id,parent.kind,NEW.version,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE parent.kind IN ('building','premises') GROUP BY parent.id,parent.kind;
 END;

CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN NOT (
 ((SELECT kind FROM location WHERE id=NEW.childLocationId) IN ('building','premises') AND (SELECT kind FROM location WHERE id=NEW.parentLocationId)='premises')
 OR ((SELECT kind FROM location WHERE id=NEW.childLocationId)='building_part' AND (SELECT kind FROM location WHERE id=NEW.parentLocationId) IN ('building','building_part')))
BEGIN SELECT RAISE(ABORT,'Invalid physical membership kinds'); END;

CREATE TRIGGER locationOccupancy_kinds BEFORE INSERT ON locationOccupancy
WHEN (SELECT kind FROM location WHERE id=NEW.establishmentLocationId)!='establishment'
 OR (NEW.containerLocationId IS NOT NULL AND (SELECT kind FROM location WHERE id=NEW.containerLocationId) NOT IN ('building','building_part','premises'))
BEGIN SELECT RAISE(ABORT,'Occupancy requires an establishment and building or premises'); END;

CREATE TRIGGER location_accessibility_insert BEFORE INSERT ON locationAccessibility BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location l JOIN locationRevision v ON v.locationId=l.id
  WHERE l.id=NEW.locationId AND l.state IN ('linked','unresolved') AND l.kind IN ('establishment','building','premises')
  AND v.id=NEW.locationRevisionId) THEN RAISE(ABORT,'Accessibility requires a shared live Location') END;
 SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationAccessibility p
  WHERE p.id=NEW.previousRevisionId AND p.locationId=NEW.locationId)
  THEN RAISE(ABORT,'Accessibility predecessor belongs to another Location') END;
END;

CREATE TRIGGER location_relationship_kind_update BEFORE UPDATE OF kind ON location
WHEN NEW.kind!=OLD.kind AND (NEW.kind='building_part' OR OLD.kind='building_part' OR
 (NEW.kind!='establishment' AND EXISTS(SELECT 1 FROM locationOccupancyHead WHERE establishmentLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current'))
 OR (NEW.kind NOT IN ('building','premises') AND (EXISTS(SELECT 1 FROM locationOccupancyHead WHERE containerLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current') OR EXISTS(SELECT 1 FROM locationMembershipHead WHERE childLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
 OR (NEW.kind!='premises' AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE parentLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
BEGIN SELECT RAISE(ABORT,'Reconcile current relationships before changing Location kind'); END;

CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
 OR COALESCE(json_extract(NEW.facts,'$.kind') IN ('unknown','premises','establishment','building','building_part','natural','address','infrastructure','street'),0)=0
 OR json_type(NEW.facts,'$.common') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.names') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.location') IS NOT 'object'
 OR json_type(NEW.facts,'$.details') IS NOT 'object'
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND json_type(NEW.facts,'$.details.brands') IS NOT 'array')
BEGIN SELECT RAISE(ABORT,'Location revisions require a versioned typed facts snapshot'); END;

CREATE TRIGGER location_revision_unknown_details BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.kind')='unknown' AND EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.details'))
BEGIN SELECT RAISE(ABORT,'Unknown Location facts cannot contain kind-specific details'); END;

CREATE VIEW locationRematchEligible AS
SELECT f.id featureId,f.projectId,fl.locationId,l.ownerOrganisationId,l.kind,
  json_object('modifiedAt',f.modifiedAt,'version',fl.version,'addressMeta',f.addressMeta,
    'projectId',f.projectId,'owner',l.ownerOrganisationId,'kind',l.kind,'locationId',l.id,
    'revisionId',(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1),
    'historyId',(SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=l.id AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))) intent,
  f.addressMeta
FROM feature f JOIN project p ON p.id=f.projectId
JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId
WHERE f.isDraft=0 AND f.isArchived=0 AND l.ssId IS NULL AND l.state IN ('manual','unresolved')
  AND (l.ownerOrganisationId IS NULL OR l.ownerOrganisationId=p.organisationId)
  AND json_extract(f.addressMeta,'$.address.association.mode')='unlinked'
  AND json_extract(f.addressMeta,'$.address.association.kind')=l.kind
  AND NOT EXISTS(SELECT 1 FROM locationRevision lr WHERE lr.locationId=l.id
    AND lr.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
    AND json_extract(lr.rawSource,'$.buildingSource.id') IS NOT NULL)
  AND (json_extract(f.addressMeta,'$.address.association.targetId') IS NULL
    OR json_extract(f.addressMeta,'$.address.association.targetId') IN (l.id,'location:'||l.id));

CREATE VIEW locationRematchCurrent AS
SELECT j.* FROM locationRematchJob j JOIN locationRematchEligible e
  ON e.featureId=j.featureId AND e.projectId=j.projectId AND e.locationId=j.locationId AND e.intent=j.intent
JOIN locationRematchRun run ON run.id=1 AND run.generation=j.generation AND COALESCE(run.lastError,'')!='PUBLICATION_REVIEW_REQUIRED';

-- An owning-building edge is durable identity evidence, independent of scoped tenancy.
CREATE TRIGGER locationMembership_part_owner BEFORE INSERT ON locationMembership
WHEN (SELECT kind FROM location WHERE id=NEW.childLocationId)='building_part'
 OR EXISTS(SELECT 1 FROM locationMembership old JOIN location child ON child.id=old.childLocationId
   WHERE old.relationshipId=NEW.relationshipId AND child.kind='building_part')
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM locationMembership old JOIN location p ON p.id=old.parentLocationId
   WHERE old.relationshipId=NEW.relationshipId AND p.kind='building'
   AND (NEW.childLocationId!=old.childLocationId OR NEW.parentLocationId!=old.parentLocationId
     OR NEW.assertionState!='asserted' OR NEW.membershipState!='current'))
 THEN RAISE(ABORT,'Building part ownership cannot be removed or reassigned') END;
 SELECT CASE WHEN NEW.assertionState='asserted' AND NEW.membershipState='current' AND (
   ((SELECT kind FROM location WHERE id=NEW.parentLocationId)='building' AND EXISTS(
     SELECT 1 FROM locationMembershipHead m JOIN location p ON p.id=m.parentLocationId
     WHERE m.childLocationId=NEW.childLocationId AND p.kind='building' AND m.parentLocationId!=NEW.parentLocationId))
   OR ((SELECT kind FROM location WHERE id=NEW.parentLocationId)='building_part' AND NOT EXISTS(
     SELECT 1 FROM locationMembershipHead child JOIN locationMembershipHead parent ON parent.parentLocationId=child.parentLocationId
     JOIN location b ON b.id=child.parentLocationId AND b.kind='building'
     WHERE child.childLocationId=NEW.childLocationId AND parent.childLocationId=NEW.parentLocationId
       AND child.assertionState='asserted' AND child.membershipState='current'
       AND parent.assertionState='asserted' AND parent.membershipState='current')))
 THEN RAISE(ABORT,'Building parts must belong to the same identified building') END;
END;
