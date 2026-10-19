-- Reviewed source identity transitions preserve HYPE identity. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE placeIdentityHistory (
  id TEXT PRIMARY KEY NOT NULL,
  placeId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  previousHistoryId TEXT REFERENCES placeIdentityHistory(id) ON DELETE RESTRICT,
  previousState TEXT NOT NULL CHECK (previousState IN ('manual','unresolved','linked')),
  previousSsId TEXT,
  ssId TEXT NOT NULL,
  sourceRevisionId TEXT NOT NULL,
  actorId TEXT NOT NULL CHECK (length(trim(actorId)) > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(placeId,sourceRevisionId) REFERENCES placeRevision(placeId,id),
  CHECK ((previousState = 'linked' AND previousSsId IS NOT NULL) OR
    (previousState != 'linked' AND previousSsId IS NULL))
);
CREATE INDEX place_identity_history_place ON placeIdentityHistory(placeId,createdAt,id);
CREATE UNIQUE INDEX place_identity_history_previous ON placeIdentityHistory(previousHistoryId)
  WHERE previousHistoryId IS NOT NULL;
CREATE UNIQUE INDEX place_identity_history_initial ON placeIdentityHistory(placeId)
  WHERE previousHistoryId IS NULL;
CREATE TRIGGER place_identity_history_no_update BEFORE UPDATE ON placeIdentityHistory
BEGIN SELECT RAISE(ABORT,'Place identity history is immutable'); END;
CREATE TRIGGER place_identity_history_no_delete BEFORE DELETE ON placeIdentityHistory
BEGIN SELECT RAISE(ABORT,'Place identity history is immutable'); END;
