-- Refs #194. A deleted HYPE identity is a terminal redirect with no successor.
-- Its receipt and all pinned revisions remain available for historical references.
CREATE TABLE locationDeletion (
  locationId TEXT PRIMARY KEY NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  revisionId TEXT NOT NULL REFERENCES locationRevision(id) ON DELETE RESTRICT,
  previousState TEXT NOT NULL CHECK(previousState IN ('manual','unresolved')),
  actorId TEXT NOT NULL CHECK(length(trim(actorId)) > 0),
  deletedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- The existing merge contract still applies to every redirect with a destination.
DROP TRIGGER location_redirect_state;
CREATE TRIGGER location_redirect_state BEFORE UPDATE OF state ON location
WHEN NEW.state='redirect' AND (
  EXISTS(SELECT 1 FROM featureLocation WHERE locationId=NEW.id)
  OR ((NEW.redirect IS NULL OR NEW.redirectTargetId IS NULL) AND NOT (
    NEW.redirect IS NULL AND NEW.redirectTargetId IS NULL
    AND EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.id))))
BEGIN SELECT RAISE(ABORT,'Location retirement requires a deletion receipt or a reviewed redirect'); END;

-- Callers look up one Location by primary key. Test each dependency independently
-- so D1's five-term compound SELECT limit does not constrain the number of guards.
CREATE VIEW locationDeletionBlocker AS
 SELECT l.id AS locationId FROM location l
 WHERE EXISTS(SELECT 1 FROM featureLocation f WHERE f.locationId=l.id)
    OR EXISTS(SELECT 1 FROM featureLocationMembership m WHERE m.containerLocationId=l.id)
    OR EXISTS(SELECT 1 FROM featureLocation f JOIN locationOccupancy o ON o.id=f.occupancyRevisionId
              WHERE o.containerLocationId=l.id)
    OR EXISTS(SELECT 1 FROM featureLocation f JOIN json_each(f.membershipRevisionIds) pin
              JOIN locationMembership m ON m.id=pin.value
              WHERE l.id IN (m.childLocationId,m.parentLocationId))
    OR EXISTS(SELECT 1 FROM fieldResearchRecord r WHERE r.locationId=l.id)
    OR EXISTS(SELECT 1 FROM premisesMapUnit u WHERE u.locationId=l.id)
    OR EXISTS(SELECT 1 FROM locationPremisesMap m WHERE m.locationId=l.id)
    OR EXISTS(SELECT 1 FROM location alias WHERE alias.redirectTargetId=l.id);

CREATE TRIGGER location_deletion_apply AFTER INSERT ON locationDeletion BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM location l WHERE l.id=NEW.locationId AND l.state=NEW.previousState AND l.ssId IS NULL
    AND (SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)=NEW.revisionId
  ) THEN RAISE(ABORT,'Location changed before deletion') END;
  -- Protect both direct Feature links and the containers pinned by accepted placements.
  SELECT CASE WHEN EXISTS(SELECT 1 FROM locationDeletionBlocker WHERE locationId=NEW.locationId)
    THEN RAISE(ABORT,'Location is still referenced') END;
  UPDATE location SET state='redirect' WHERE id=NEW.locationId;
END;
CREATE TRIGGER location_deletion_immutable_update BEFORE UPDATE ON locationDeletion
BEGIN SELECT RAISE(ABORT,'Location deletion receipts are immutable'); END;
CREATE TRIGGER location_deletion_immutable_delete BEFORE DELETE ON locationDeletion
BEGIN SELECT RAISE(ABORT,'Location deletion receipts are immutable'); END;

-- Active relationship reads release the edges of the deleted identity in every scope.
-- Historical readers and pinned evidence continue to address the original assertions.
DROP VIEW locationMembershipHead;
CREATE VIEW locationMembershipHead AS SELECT r.* FROM locationMembership r
 WHERE NOT EXISTS(SELECT 1 FROM locationMembership next WHERE next.previousRevisionId=r.id)
 AND NOT EXISTS(SELECT 1 FROM locationDeletion d WHERE d.locationId IN (r.parentLocationId,r.childLocationId));
DROP VIEW locationOccupancyHead;
CREATE VIEW locationOccupancyHead AS SELECT r.* FROM locationOccupancy r
 WHERE NOT EXISTS(SELECT 1 FROM locationOccupancy next WHERE next.previousRevisionId=r.id)
 AND NOT EXISTS(SELECT 1 FROM locationDeletion d WHERE d.locationId IN (r.establishmentLocationId,r.containerLocationId));
DROP VIEW locationAddressHead;
CREATE VIEW locationAddressHead AS SELECT r.* FROM locationAddress r
 WHERE NOT EXISTS(SELECT 1 FROM locationAddress next WHERE next.previousRevisionId=r.id)
 AND NOT EXISTS(SELECT 1 FROM locationDeletion d WHERE d.locationId=r.locationId);

DROP VIEW locationTransitionHead;
CREATE VIEW locationTransitionHead AS SELECT r.* FROM locationTransition r
 WHERE NOT EXISTS(SELECT 1 FROM locationTransition next WHERE next.previousRevisionId=r.id)
 AND NOT EXISTS(SELECT 1 FROM locationTransitionParticipant p JOIN locationDeletion d ON d.locationId=p.locationId
   WHERE p.transitionRevisionId=r.id);

-- Check the actual placement pins, including parts omitted from the building/premises projection.
CREATE VIEW locationDeletedPlacementRevision AS
 SELECT o.id, 'occupancy' AS kind FROM locationOccupancy o JOIN locationDeletion d ON d.locationId=o.containerLocationId
 UNION ALL SELECT m.id, 'membership' FROM locationMembership m JOIN locationDeletion d ON d.locationId IN (m.childLocationId,m.parentLocationId);

-- Stale writes cannot create new associations or revisions against a retired identity.
CREATE TRIGGER location_deleted_feature_insert BEFORE INSERT ON featureLocation
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
 OR EXISTS(SELECT 1 FROM locationDeletedPlacementRevision WHERE kind='occupancy' AND id=NEW.occupancyRevisionId)
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j JOIN locationDeletedPlacementRevision r ON r.kind='membership' AND r.id=j.value)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_feature_update BEFORE UPDATE OF locationId,occupancyRevisionId,membershipRevisionIds ON featureLocation
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
 OR EXISTS(SELECT 1 FROM locationDeletedPlacementRevision WHERE kind='occupancy' AND id=NEW.occupancyRevisionId)
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j JOIN locationDeletedPlacementRevision r ON r.kind='membership' AND r.id=j.value)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_feature_container BEFORE INSERT ON featureLocationMembership
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.containerLocationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_revision BEFORE INSERT ON locationRevision
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_membership BEFORE INSERT ON locationMembership
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId IN (NEW.parentLocationId,NEW.childLocationId))
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_occupancy BEFORE INSERT ON locationOccupancy
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId IN (NEW.establishmentLocationId,NEW.containerLocationId))
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_address BEFORE INSERT ON locationAddress
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_field_capture_insert BEFORE INSERT ON fieldResearchRecord
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_field_capture_update BEFORE UPDATE OF locationId ON fieldResearchRecord
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_map_unit_insert BEFORE INSERT ON premisesMapUnit
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_map_unit_update BEFORE UPDATE OF locationId ON premisesMapUnit
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_map_insert BEFORE INSERT ON locationPremisesMap
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
CREATE TRIGGER location_deleted_map_update BEFORE UPDATE OF locationId ON locationPremisesMap
WHEN EXISTS(SELECT 1 FROM locationDeletion WHERE locationId=NEW.locationId)
BEGIN SELECT RAISE(ABORT,'Location was deleted'); END;
