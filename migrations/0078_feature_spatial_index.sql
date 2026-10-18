-- H3 is computed in application code for each resolution directly from the point.
-- The geometry signature prevents a legacy/raw geometry write reusing stale cells.
ALTER TABLE `feature` ADD COLUMN `spatialIndex` text;

CREATE TABLE `featureSpatial` (
  `featureId` text NOT NULL REFERENCES `feature` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  `resolution` integer NOT NULL CHECK (`resolution` BETWEEN 0 AND 12),
  `cell` text NOT NULL,
  `layerId` text NOT NULL,
  `longitude` real NOT NULL,
  `latitude` real NOT NULL,
  PRIMARY KEY (`featureId`, `resolution`)
);
CREATE INDEX `featureSpatial_cell_layer_idx`
  ON `featureSpatial` (`resolution`, `cell`, `layerId`, `featureId`);
-- Backfill only visits missing point indexes in ID order; completed rows leave this index.
CREATE INDEX `feature_spatial_pending_idx` ON `feature` (`id`)
  WHERE `spatialIndex` IS NULL AND json_extract(`geometry`, '$.type') = 'Point';

CREATE TRIGGER `feature_spatial_insert` AFTER INSERT ON `feature`
WHEN NEW.spatialIndex IS NOT NULL
BEGIN
  INSERT INTO `featureSpatial` (`featureId`, `resolution`, `cell`, `layerId`, `longitude`, `latitude`)
  SELECT NEW.id, CAST(cells.key AS integer), cells.value, NEW.layerId,
    json_extract(NEW.spatialIndex, '$.longitude'), json_extract(NEW.spatialIndex, '$.latitude')
  FROM json_each(NEW.spatialIndex, '$.cells') AS cells
  WHERE json(json_extract(NEW.spatialIndex, '$.geometry')) = json(NEW.geometry)
    AND json_extract(NEW.geometry, '$.type') = 'Point';
END;

CREATE TRIGGER `feature_spatial_update` AFTER UPDATE OF `geometry`, `spatialIndex`, `layerId` ON `feature`
BEGIN
  DELETE FROM `featureSpatial` WHERE `featureId` = NEW.id;
  INSERT INTO `featureSpatial` (`featureId`, `resolution`, `cell`, `layerId`, `longitude`, `latitude`)
  SELECT NEW.id, CAST(cells.key AS integer), cells.value, NEW.layerId,
    json_extract(NEW.spatialIndex, '$.longitude'), json_extract(NEW.spatialIndex, '$.latitude')
  FROM json_each(NEW.spatialIndex, '$.cells') AS cells
  WHERE NEW.spatialIndex IS NOT NULL
    AND json(json_extract(NEW.spatialIndex, '$.geometry')) = json(NEW.geometry)
    AND json_extract(NEW.geometry, '$.type') = 'Point';
  -- Legacy/manual geometry edits become pending repairs instead of stale map hits.
  UPDATE `feature` SET `spatialIndex` = NULL
  WHERE `id` = NEW.id AND NEW.spatialIndex IS NOT NULL
    AND json(json_extract(NEW.spatialIndex, '$.geometry')) IS NOT json(NEW.geometry);
END;
