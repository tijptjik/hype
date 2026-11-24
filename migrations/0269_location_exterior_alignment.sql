CREATE TABLE locationExteriorAlignment (
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  assetId TEXT NOT NULL,
  geometryId TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  alignment TEXT NOT NULL CHECK (json_valid(alignment)),
  actorId TEXT NOT NULL,
  savedAt TEXT NOT NULL,
  PRIMARY KEY (locationId, assetId, geometryId, revision)
);
