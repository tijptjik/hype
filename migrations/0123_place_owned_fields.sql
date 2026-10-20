-- Refs #194. Settings belong to Project; unlinked brand corrections belong to Feature.
ALTER TABLE project ADD COLUMN placePolicy TEXT CHECK(placePolicy IS NULL OR json_valid(placePolicy));
ALTER TABLE project ADD COLUMN placePolicyRevision INTEGER NOT NULL DEFAULT 0 CHECK(placePolicyRevision>=0);
UPDATE project SET
  placePolicy=(SELECT policy FROM projectPlacePolicy WHERE projectId=project.id),
  placePolicyRevision=coalesce((SELECT revision FROM projectPlacePolicy WHERE projectId=project.id),0)
WHERE EXISTS(SELECT 1 FROM projectPlacePolicy WHERE projectId=project.id);
DROP TABLE projectPlacePolicy;

ALTER TABLE feature ADD COLUMN localPlaceBrands TEXT
  CHECK(localPlaceBrands IS NULL OR
    (json_valid(localPlaceBrands) AND json_type(localPlaceBrands,'$.brands')='array'));
UPDATE feature SET localPlaceBrands=(
  SELECT json_object('brands',json(brands),'revision',revision,
    'sourceAssociationRevision',sourceAssociationRevision,'actorId',actorId)
  FROM featurePlaceDetached WHERE featureId=feature.id)
WHERE EXISTS(SELECT 1 FROM featurePlaceDetached WHERE featureId=feature.id);
DROP TRIGGER feature_place_clear_detached;
DROP TRIGGER feature_place_history_delete;
-- Linking captures local brands in overrides before retiring their detached copy.
CREATE TRIGGER feature_place_clear_detached AFTER INSERT ON featurePlace BEGIN
  UPDATE feature SET localPlaceBrands=NULL WHERE id=NEW.featureId AND localPlaceBrands IS NOT NULL;
END;
CREATE TRIGGER feature_place_history_delete AFTER DELETE ON featurePlace BEGIN
  INSERT INTO featurePlaceHistory(featureId,revision,previousRevision,action,placeId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES(OLD.featureId,OLD.revision,OLD.revision,'unlink',OLD.placeId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.overrides,
    (SELECT json_extract(localPlaceBrands,'$.actorId') FROM feature WHERE id=OLD.featureId
      AND json_extract(localPlaceBrands,'$.sourceAssociationRevision')=OLD.revision));
END;
DROP TABLE featurePlaceDetached;
