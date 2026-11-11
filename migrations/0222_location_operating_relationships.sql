-- Reuse immutable occupancy revisions for explicit Operates in relationships.
-- Historical table/column names and accepted Feature revision references remain stable.
DROP TRIGGER locationOccupancy_kinds;
CREATE TRIGGER locationOccupancy_kinds BEFORE INSERT ON locationOccupancy
WHEN NEW.establishmentLocationId IS NEW.containerLocationId
 OR (SELECT matchingType FROM location WHERE id=NEW.establishmentLocationId) NOT IN ('establishment','service_point')
 OR (NEW.containerLocationId IS NOT NULL AND NOT (
   (SELECT matchingType FROM location WHERE id=NEW.containerLocationId) IN ('building','building_part','premises','structure')
   OR ((SELECT matchingType FROM location WHERE id=NEW.establishmentLocationId)='service_point'
     AND (SELECT matchingType FROM location WHERE id=NEW.containerLocationId)='establishment')))
BEGIN SELECT RAISE(ABORT,'Invalid operating location or host'); END;

DROP TRIGGER location_relationship_kind_update;
CREATE TRIGGER location_relationship_kind_update BEFORE UPDATE OF kind, class ON location
WHEN NEW.kind IS NOT OLD.kind OR NEW.class IS NOT OLD.class
BEGIN
 SELECT CASE WHEN
  COALESCE(NEW.class,CASE NEW.kind WHEN 'geographic' THEN 'natural' ELSE NEW.kind END)='building_part'
  OR COALESCE(OLD.class,CASE OLD.kind WHEN 'geographic' THEN 'natural' ELSE OLD.kind END)='building_part'
  OR EXISTS(SELECT 1 FROM locationOccupancyHead o JOIN location host ON host.id=o.containerLocationId
    WHERE o.establishmentLocationId=NEW.id AND o.assertionState='asserted' AND o.occupancyState='current'
    AND (NEW.kind!='operational' OR NEW.class NOT IN ('establishment','service_point')
      OR (host.matchingType='establishment' AND NEW.class!='service_point')))
  OR (NEW.kind!='operational' AND EXISTS(SELECT 1 FROM locationOccupancyHead
    WHERE establishmentLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current'))
  OR EXISTS(SELECT 1 FROM locationOccupancyHead o JOIN location occupant ON occupant.id=o.establishmentLocationId
    WHERE o.containerLocationId=NEW.id AND o.assertionState='asserted' AND o.occupancyState='current'
    AND NOT ((NEW.kind='built' AND NEW.class IN ('building','premises','structure'))
      OR (NEW.kind='operational' AND NEW.class='establishment' AND occupant.matchingType='service_point')))
  OR (COALESCE(NEW.class,NEW.kind) NOT IN ('building','premises') AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE childLocationId=NEW.id AND assertionState='asserted' AND membershipState='current'))
  OR (COALESCE(NEW.class,NEW.kind)!='premises' AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE parentLocationId=NEW.id AND assertionState='asserted' AND membershipState='current'))
 THEN RAISE(ABORT,'Reconcile current relationships before changing Location kind') END;
END;
