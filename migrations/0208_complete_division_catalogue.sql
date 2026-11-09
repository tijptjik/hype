-- Catalogue completeness is independent of which divisions existing Features use.
ALTER TABLE divisionRefresh ADD COLUMN catalogueRelease TEXT;
ALTER TABLE divisionRefresh ADD COLUMN catalogueTarget TEXT;
ALTER TABLE divisionRefresh ADD COLUMN catalogueOffset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE divisionRefresh ADD COLUMN catalogueTotal INTEGER;
ALTER TABLE divisionRefresh ADD COLUMN catalogueRevision TEXT;

-- Pages remain private until their pinned release is complete and atomically published.
CREATE TABLE divisionCatalogueStage (
  id TEXT PRIMARY KEY,
  apiReleaseSet TEXT NOT NULL,
  attributes TEXT NOT NULL
);

-- Large archipelago polygons exceed D1's 2 MB row limit; preserve exact coordinates in bounded parts.
CREATE TABLE divisionGeometryPart (
  divisionId TEXT NOT NULL REFERENCES divisionDefinition(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  geometries TEXT NOT NULL,
  PRIMARY KEY(divisionId,part)
) WITHOUT ROWID;
CREATE TABLE divisionGeometryStage (
  divisionId TEXT NOT NULL,
  part INTEGER NOT NULL,
  geometries TEXT NOT NULL,
  PRIMARY KEY(divisionId,part)
) WITHOUT ROWID;
