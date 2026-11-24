CREATE TABLE locationExteriorModel (
  locationId TEXT PRIMARY KEY REFERENCES location(id) ON DELETE RESTRICT,
  assetId TEXT NOT NULL,
  sourceModelId TEXT NOT NULL,
  sourceSheet TEXT NOT NULL,
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
