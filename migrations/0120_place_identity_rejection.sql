-- Retain rejected establishment candidates without changing Place or Feature identity. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE placeIdentityRejection (
  reviewId TEXT PRIMARY KEY NOT NULL REFERENCES placeIdentityReview(id) ON DELETE RESTRICT,
  placeId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  ssId TEXT NOT NULL,
  actorId TEXT NOT NULL CHECK(length(trim(actorId))>0),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX place_identity_rejection_candidate ON placeIdentityRejection(placeId,ssId);
CREATE TRIGGER place_identity_rejection_valid BEFORE INSERT ON placeIdentityRejection
WHEN NOT EXISTS (SELECT 1 FROM placeIdentityReview r WHERE r.id=NEW.reviewId
  AND r.placeId=NEW.placeId AND json_extract(r.projection,'$.ssId')=NEW.ssId)
  OR EXISTS (SELECT 1 FROM placeIdentityHistory WHERE reviewId=NEW.reviewId)
  OR EXISTS (SELECT 1 FROM placeRedirect d JOIN placeMergeReview m ON m.id=d.reviewId
    WHERE m.identityReviewId=NEW.reviewId)
BEGIN SELECT RAISE(ABORT,'Place identity review cannot be rejected'); END;
CREATE TRIGGER place_identity_rejection_no_update BEFORE UPDATE ON placeIdentityRejection
BEGIN SELECT RAISE(ABORT,'Place identity rejection is immutable'); END;
CREATE TRIGGER place_identity_rejection_no_delete BEFORE DELETE ON placeIdentityRejection
BEGIN SELECT RAISE(ABORT,'Place identity rejection is immutable'); END;
CREATE TRIGGER place_identity_history_not_rejected BEFORE INSERT ON placeIdentityHistory
WHEN EXISTS (SELECT 1 FROM placeIdentityRejection WHERE reviewId=NEW.reviewId)
BEGIN SELECT RAISE(ABORT,'Place identity review was rejected'); END;
CREATE TRIGGER place_redirect_not_rejected BEFORE INSERT ON placeRedirect
WHEN EXISTS (SELECT 1 FROM placeMergeReview m JOIN placeIdentityRejection r
  ON r.reviewId=m.identityReviewId WHERE m.id=NEW.reviewId)
BEGIN SELECT RAISE(ABORT,'Place identity review was rejected'); END;
