-- Refs #178. Curated affiliations are independent of raw Location source records.
CREATE TABLE identityCatalogue (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('brand','group')),
  version INTEGER NOT NULL CHECK(version>0)
);
CREATE TABLE identityCatalogueRevision (
  catalogueId TEXT NOT NULL REFERENCES identityCatalogue(id),
  version INTEGER NOT NULL CHECK(version>0),
  content TEXT NOT NULL CHECK(json_valid(content) AND json_type(content,'$.i18n')='object'),
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY(catalogueId,version)
);
CREATE TABLE identityCatalogueSource (
  source TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  catalogueId TEXT NOT NULL REFERENCES identityCatalogue(id),
  PRIMARY KEY(source,sourceId)
);
CREATE TRIGGER identity_catalogue_revision_immutable_update BEFORE UPDATE ON identityCatalogueRevision BEGIN SELECT RAISE(ABORT,'Catalogue revisions are immutable'); END;
CREATE TRIGGER identity_catalogue_revision_immutable_delete BEFORE DELETE ON identityCatalogueRevision BEGIN SELECT RAISE(ABORT,'Catalogue revisions are immutable'); END;
CREATE TRIGGER identity_catalogue_kind_immutable BEFORE UPDATE OF id,kind ON identityCatalogue BEGIN SELECT RAISE(ABORT,'Catalogue identity is immutable'); END;
