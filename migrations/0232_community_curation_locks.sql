-- SuperAdmin-managed, append-only field openness for community curations.
-- Missing fields are open. Locks do not alter accepted evidence or Organisation customizations.
CREATE TABLE locationCurationLockRevision (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  previousRevisionId TEXT REFERENCES locationCurationLockRevision(id),
  openFields TEXT NOT NULL CHECK(json_valid(openFields) AND json_type(openFields)='object'),
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX location_curation_lock_root ON locationCurationLockRevision(locationId) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX location_curation_lock_successor ON locationCurationLockRevision(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE VIEW locationCurationLockHead AS SELECT r.* FROM locationCurationLockRevision r
WHERE NOT EXISTS(SELECT 1 FROM locationCurationLockRevision n WHERE n.previousRevisionId=r.id);
CREATE TRIGGER location_curation_lock_insert BEFORE INSERT ON locationCurationLockRevision
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state IN ('linked','unresolved'))
    THEN RAISE(ABORT,'Community Location required') END;
  SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM locationCurationLockHead WHERE id=NEW.previousRevisionId AND locationId=NEW.locationId)
    THEN RAISE(ABORT,'Community curation locks changed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.openFields) WHERE type NOT IN ('true','false'))
    THEN RAISE(ABORT,'Community curation openness must be boolean') END;
END;
CREATE TRIGGER location_curation_lock_immutable_update BEFORE UPDATE ON locationCurationLockRevision
BEGIN SELECT RAISE(ABORT,'Community curation lock history is immutable'); END;
CREATE TRIGGER location_curation_lock_immutable_delete BEFORE DELETE ON locationCurationLockRevision
BEGIN SELECT RAISE(ABORT,'Community curation lock history is immutable'); END;
