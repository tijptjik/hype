-- Keep only the current correction for each upstream field, independently of source refreshes.
CREATE TABLE premisesMapCorrection (
  mapId TEXT NOT NULL REFERENCES premisesMap(id),
  sourceDataset TEXT NOT NULL,
  sourceLayer TEXT NOT NULL,
  sourceEntityId TEXT NOT NULL,
  field TEXT NOT NULL,
  originalValue TEXT,
  correctedValue TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  reason TEXT NOT NULL,
  authorUserId TEXT NOT NULL REFERENCES user(id),
  PRIMARY KEY (mapId, sourceDataset, sourceLayer, sourceEntityId, field)
);
