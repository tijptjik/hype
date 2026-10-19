-- Association concurrency tokens and immutable evidence. Refs #194.
-- spec/breadline/proposal/01-places-features.md
ALTER TABLE featurePlace ADD COLUMN revision TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE featurePlace ADD COLUMN actorId TEXT;
CREATE TABLE featurePlaceHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  featureId TEXT NOT NULL,
  revision TEXT NOT NULL,
  previousRevision TEXT,
  action TEXT NOT NULL CHECK (action IN ('baseline', 'link', 'update', 'unlink')),
  placeId TEXT NOT NULL,
  factsRevisionId TEXT NOT NULL,
  locationRevisionId TEXT NOT NULL,
  overrides TEXT NOT NULL CHECK (json_valid(overrides)),
  actorId TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- History deliberately survives Feature deletion and never cascades to other records.
CREATE UNIQUE INDEX feature_place_history_revision ON featurePlaceHistory(featureId, revision)
  WHERE action != 'unlink';
CREATE INDEX feature_place_history_feature ON featurePlaceHistory(featureId, id);
INSERT INTO featurePlaceHistory(featureId,revision,action,placeId,factsRevisionId,locationRevisionId,overrides)
SELECT featureId,revision,'baseline',placeId,factsRevisionId,locationRevisionId,overrides FROM featurePlace;

CREATE TRIGGER feature_place_revision_update BEFORE UPDATE ON featurePlace
WHEN NEW.featureId != OLD.featureId OR NEW.revision = OLD.revision OR length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Place update requires a new revision'); END;
CREATE TRIGGER feature_place_revision_insert BEFORE INSERT ON featurePlace
WHEN length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Place revision is required'); END;
CREATE TRIGGER feature_place_history_insert AFTER INSERT ON featurePlace
BEGIN
  INSERT INTO featurePlaceHistory(featureId,revision,action,placeId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES (NEW.featureId,NEW.revision,'link',NEW.placeId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.overrides,NEW.actorId);
END;
CREATE TRIGGER feature_place_history_update AFTER UPDATE ON featurePlace
BEGIN
  INSERT INTO featurePlaceHistory(featureId,revision,previousRevision,action,placeId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES (NEW.featureId,NEW.revision,OLD.revision,'update',NEW.placeId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.overrides,NEW.actorId);
END;
-- A deletion can be a Feature cascade; do not misattribute it to the last editor.
CREATE TRIGGER feature_place_history_delete AFTER DELETE ON featurePlace
BEGIN
  INSERT INTO featurePlaceHistory(featureId,revision,previousRevision,action,placeId,factsRevisionId,locationRevisionId,overrides)
  VALUES (OLD.featureId,OLD.revision,OLD.revision,'unlink',OLD.placeId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.overrides);
END;
CREATE TRIGGER feature_place_history_no_update BEFORE UPDATE ON featurePlaceHistory
BEGIN SELECT RAISE(ABORT, 'Feature Place history is immutable'); END;
CREATE TRIGGER feature_place_history_no_delete BEFORE DELETE ON featurePlaceHistory
BEGIN SELECT RAISE(ABORT, 'Feature Place history is immutable'); END;
