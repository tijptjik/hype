-- Editorial intent is independent of Location identity and map geometry.
ALTER TABLE feature ADD COLUMN featureType TEXT;
CREATE TABLE featureIntentPolicy (
  scopeType TEXT NOT NULL CHECK(scopeType IN ('hub','project','layer')),
  scopeId TEXT NOT NULL,
  definition TEXT CHECK(definition IS NULL OR json_valid(definition)),
  version INTEGER NOT NULL DEFAULT 1,
  actorId TEXT NOT NULL REFERENCES user(id),
  PRIMARY KEY(scopeType, scopeId)
);
CREATE TABLE featureIntentPolicyRevision (
  id TEXT PRIMARY KEY NOT NULL,
  scopeType TEXT NOT NULL,
  scopeId TEXT NOT NULL,
  definition TEXT,
  version INTEGER NOT NULL,
  actorId TEXT NOT NULL REFERENCES user(id),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
