-- Refs #194. Private source identity, independent of configurable feature properties.
CREATE TABLE breadlineImportFeature (
  sourceTable TEXT NOT NULL CHECK(sourceTable IN ('donors','dropoffs')),
  sourceId TEXT NOT NULL,
  featureId TEXT NOT NULL UNIQUE REFERENCES feature(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  sourceHash TEXT NOT NULL,
  importedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(sourceTable,sourceId)
);
