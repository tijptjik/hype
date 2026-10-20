-- Retained server-verified candidate evidence for explicit identity review. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE placeIdentityReview (
  id TEXT PRIMARY KEY NOT NULL,
  placeId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  ownerProjectId TEXT,
  baseline TEXT NOT NULL CHECK (json_valid(baseline)),
  projection TEXT NOT NULL CHECK (json_valid(projection)),
  actorId TEXT NOT NULL CHECK (length(trim(actorId)) > 0),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX place_identity_review_place ON placeIdentityReview(placeId,createdAt,id);
CREATE TRIGGER place_identity_review_no_update BEFORE UPDATE ON placeIdentityReview
BEGIN SELECT RAISE(ABORT,'Place identity review is immutable'); END;
CREATE TRIGGER place_identity_review_no_delete BEFORE DELETE ON placeIdentityReview
BEGIN SELECT RAISE(ABORT,'Place identity review is immutable'); END;

-- Bind an accepted identity event to the exact comparison shown to its reviewer.
ALTER TABLE placeIdentityHistory ADD COLUMN reviewId TEXT REFERENCES placeIdentityReview(id) ON DELETE RESTRICT;
