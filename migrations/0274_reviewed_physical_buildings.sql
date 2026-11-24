-- Refs #194. Keep the authored parent identity and its pinned evidence from the original combine flow.
-- Only an explicit constituent selection creates a membership.
CREATE VIEW reviewedPhysicalBuilding AS
SELECT locationId FROM locationRevision
WHERE version=1 AND rawSource->>'$.kind'='reviewed-building-evidence'
  AND rawSource->>'$.buildingEvidence.review'='explicit-physical-building';

DROP TRIGGER locationMembership_kinds;
CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN NOT (
 ((SELECT matchingType FROM location WHERE id=NEW.childLocationId) IN ('building','premises') AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='premises')
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building_part' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId) IN ('building','building_part','premises'))
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='building'
   AND EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.childLocationId AND json_extract(rawSource,'$.kind')='building-export-baseline')
   AND (EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.parentLocationId AND ((version=1 AND rawSource->>'$.kind'='physical-building-member') OR rawSource->>'$.kind'='physical-building-designation'))
     OR EXISTS(SELECT 1 FROM reviewedPhysicalBuilding WHERE locationId=NEW.parentLocationId))))
BEGIN SELECT RAISE(ABORT,'Invalid physical membership kinds'); END;
