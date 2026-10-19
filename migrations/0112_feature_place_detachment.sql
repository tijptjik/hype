-- Preserve ordered brand arrays when a Feature stops inheriting from a Place. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE featurePlaceDetached (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  sourceAssociationRevision TEXT NOT NULL,
  actorId TEXT NOT NULL,
  brands TEXT NOT NULL CHECK (json_valid(brands) AND json_type(brands) = 'array')
);
-- Linking captures this baseline in overrides before retiring its detached copy.
CREATE TRIGGER feature_place_clear_detached AFTER INSERT ON featurePlace
BEGIN
  DELETE FROM featurePlaceDetached WHERE featureId = NEW.featureId;
END;
DROP TRIGGER feature_place_history_delete;
CREATE TRIGGER feature_place_history_delete AFTER DELETE ON featurePlace
BEGIN
  INSERT INTO featurePlaceHistory(featureId,revision,previousRevision,action,placeId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES (OLD.featureId,OLD.revision,OLD.revision,'unlink',OLD.placeId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.overrides,
    (SELECT actorId FROM featurePlaceDetached WHERE featureId=OLD.featureId AND sourceAssociationRevision=OLD.revision));
END;
