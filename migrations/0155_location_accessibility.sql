-- Shared admin observations are independent of immutable publisher snapshots and Organisation corrections.
CREATE TABLE locationAccessibility (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  previousRevisionId TEXT REFERENCES locationAccessibility(id) ON DELETE RESTRICT,
  locationRevisionId TEXT NOT NULL REFERENCES locationRevision(id) ON DELETE RESTRICT,
  placementKey TEXT NOT NULL,
  valuesJson TEXT NOT NULL CHECK(json_valid(valuesJson)),
  actorId TEXT NOT NULL,
  recordedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX location_accessibility_root ON locationAccessibility(locationId) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX location_accessibility_successor ON locationAccessibility(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE INDEX location_accessibility_subject ON locationAccessibility(locationId);
CREATE VIEW locationAccessibilityHead AS SELECT a.* FROM locationAccessibility a
 WHERE NOT EXISTS(SELECT 1 FROM locationAccessibility next WHERE next.previousRevisionId=a.id);
CREATE TRIGGER location_accessibility_insert BEFORE INSERT ON locationAccessibility BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location l JOIN locationRevision v ON v.locationId=l.id
  WHERE l.id=NEW.locationId AND l.state IN ('linked','unresolved') AND l.kind IN ('establishment','building','premises')
  AND v.id=NEW.locationRevisionId) THEN RAISE(ABORT,'Accessibility requires a shared live Location') END;
 SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationAccessibility p
  WHERE p.id=NEW.previousRevisionId AND p.locationId=NEW.locationId)
  THEN RAISE(ABORT,'Accessibility predecessor belongs to another Location') END;
END;
CREATE TRIGGER location_accessibility_no_update BEFORE UPDATE ON locationAccessibility BEGIN
 SELECT RAISE(ABORT,'Accessibility history is immutable');
END;
CREATE TRIGGER location_accessibility_no_delete BEFORE DELETE ON locationAccessibility BEGIN
 SELECT RAISE(ABORT,'Accessibility history is immutable');
END;
