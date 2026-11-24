-- Refs #194. Imported buildings can be explicitly designated as the physical parent.
-- Retain the original import and its facts. No self-membership is created.
CREATE TRIGGER location_composition_designation BEFORE INSERT ON locationRevision
WHEN NEW.rawSource->>'$.kind'='physical-building-designation' AND NOT EXISTS (
  SELECT 1 FROM location l JOIN locationRevision seed ON seed.locationId=l.id AND seed.version=1
  WHERE l.id=NEW.locationId AND l.matchingType='building' AND l.state='unresolved' AND l.ssId IS NULL
    AND l.ownerOrganisationId=NEW.rawSource->>'$.organisationId' AND seed.rawSource->>'$.kind'='building-export-baseline'
)
BEGIN SELECT RAISE(ABORT,'Select an owned imported building'); END;

DROP TRIGGER locationMembership_kinds;
CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN NOT (
 ((SELECT matchingType FROM location WHERE id=NEW.childLocationId) IN ('building','premises') AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='premises')
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building_part' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId) IN ('building','building_part','premises'))
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='building'
   AND EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.childLocationId AND json_extract(rawSource,'$.kind')='building-export-baseline')
   AND EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.parentLocationId AND ((version=1 AND rawSource->>'$.kind'='physical-building-member') OR rawSource->>'$.kind'='physical-building-designation'))))
BEGIN SELECT RAISE(ABORT,'Invalid physical membership kinds'); END;
