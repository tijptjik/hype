-- Refs #194. Immutable receipts fence atomic address reordering; coverage is not an address fact.
CREATE TABLE locationRelationshipOperation (
 id TEXT PRIMARY KEY NOT NULL,
 scopeOrganisationId TEXT REFERENCES organisation(id),
 locationId TEXT NOT NULL REFERENCES location(id),
 rawSource TEXT NOT NULL CHECK(json_valid(rawSource)),
 recordedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER location_relationship_operation_immutable_update BEFORE UPDATE ON locationRelationshipOperation BEGIN SELECT RAISE(ABORT,'Relationship operation receipts are immutable'); END;
CREATE TRIGGER location_relationship_operation_immutable_delete BEFORE DELETE ON locationRelationshipOperation BEGIN SELECT RAISE(ABORT,'Relationship operation receipts are immutable'); END;
ALTER TABLE locationAddress DROP COLUMN coverage;

-- Identity corrections resolve aliases; real-world replacement/merge/split events do not redirect.
CREATE VIEW locationCanonical AS
WITH RECURSIVE chain(aliasId,locationId) AS (
 SELECT id,id FROM location
 UNION SELECT c.aliasId,l.redirectTargetId FROM chain c JOIN location l ON l.id=c.locationId WHERE l.redirectTargetId IS NOT NULL
)
SELECT c.aliasId,c.locationId FROM chain c JOIN location l ON l.id=c.locationId WHERE l.redirectTargetId IS NULL AND l.state!='redirect';

DROP TRIGGER feature_location_placement_insert;
CREATE TRIGGER feature_location_placement_insert BEFORE INSERT ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=(SELECT locationId FROM locationCanonical WHERE aliasId=o.containerLocationId) OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND (SELECT locationId FROM locationCanonical WHERE aliasId=o.establishmentLocationId)=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId),(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM reached r JOIN locationMembership m ON (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId)=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;

DROP TRIGGER feature_location_placement_update;
CREATE TRIGGER feature_location_placement_update BEFORE UPDATE ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=(SELECT locationId FROM locationCanonical WHERE aliasId=o.containerLocationId) OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND (SELECT locationId FROM locationCanonical WHERE aliasId=o.establishmentLocationId)=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId),(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM reached r JOIN locationMembership m ON (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId)=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;

DROP TRIGGER feature_location_grouping_insert;
CREATE TRIGGER feature_location_grouping_insert AFTER INSERT ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.revision,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId),'premises',NEW.revision,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId);
 END;

DROP TRIGGER feature_location_grouping_update;
CREATE TRIGGER feature_location_grouping_update AFTER UPDATE ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.revision,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId),'premises',NEW.revision,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId);
 END;
