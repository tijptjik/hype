-- Additive Place storage. Refs #194; spec/breadline/proposal/01-places-features.md.
-- No existing Feature is linked or rewritten by this schema expansion.
CREATE TABLE place (
  id TEXT PRIMARY KEY NOT NULL,
  ssId TEXT UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('linked', 'unresolved', 'manual')),
  ownerProjectId TEXT REFERENCES project(id) ON DELETE RESTRICT,
  sourceAvailability TEXT NOT NULL DEFAULT 'current' CHECK (sourceAvailability IN ('current', 'missing', 'review')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((state = 'linked' AND ssId IS NOT NULL) OR (state != 'linked' AND ssId IS NULL AND ownerProjectId IS NOT NULL))
);
CREATE TABLE placeRevision (
  id TEXT PRIMARY KEY NOT NULL,
  placeId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  origin TEXT NOT NULL CHECK (origin IN ('saanseoi', 'local')),
  ssId TEXT,
  apiVersion TEXT,
  releaseId TEXT,
  snapshotId TEXT,
  contentHash TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  facts TEXT NOT NULL CHECK (json_valid(facts)),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (placeId, id),
  UNIQUE (placeId, sequence),
  CHECK (origin = 'local' OR (ssId IS NOT NULL AND apiVersion IS NOT NULL AND releaseId IS NOT NULL AND snapshotId IS NOT NULL))
);
CREATE TRIGGER place_revision_no_update BEFORE UPDATE ON placeRevision
BEGIN SELECT RAISE(ABORT, 'Place revisions are immutable'); END;
CREATE TRIGGER place_revision_no_delete BEFORE DELETE ON placeRevision
BEGIN SELECT RAISE(ABORT, 'Place revisions are immutable'); END;
CREATE TABLE projectPlacePolicy (
  projectId TEXT PRIMARY KEY NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  policy TEXT NOT NULL CHECK (json_valid(policy)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE featurePlace (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  placeId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  factsRevisionId TEXT NOT NULL,
  locationRevisionId TEXT NOT NULL,
  overrides TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides)),
  FOREIGN KEY (placeId, factsRevisionId) REFERENCES placeRevision(placeId, id),
  FOREIGN KEY (placeId, locationRevisionId) REFERENCES placeRevision(placeId, id)
);
CREATE INDEX feature_place_place ON featurePlace(placeId, featureId);
