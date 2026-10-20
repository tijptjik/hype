-- Preserve absorbed Place IDs as immutable redirects. Refs #194.
-- spec/breadline/proposal/01-places-features.md
-- Rebuild the parent with deferred checks; its children use RESTRICT, never CASCADE.
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER IF EXISTS feature_place_scope_insert;
DROP TRIGGER IF EXISTS feature_place_scope_update;
DROP TRIGGER IF EXISTS feature_place_feature_scope;
DROP TRIGGER IF EXISTS feature_place_owner_scope;
CREATE TABLE place_next (
  id TEXT PRIMARY KEY NOT NULL,
  ssId TEXT UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('linked','unresolved','manual','redirect')),
  ownerProjectId TEXT REFERENCES project(id) ON DELETE RESTRICT,
  sourceAvailability TEXT NOT NULL DEFAULT 'current' CHECK (sourceAvailability IN ('current','missing','review')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((state='linked' AND ssId IS NOT NULL) OR
    (state IN ('unresolved','manual') AND ssId IS NULL AND ownerProjectId IS NOT NULL) OR
    (state='redirect' AND ssId IS NULL))
);
INSERT INTO place_next SELECT * FROM place;
DROP TABLE place;
ALTER TABLE place_next RENAME TO place;
CREATE TRIGGER feature_place_scope_insert BEFORE INSERT ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerProjectId IS NULL OR p.ownerProjectId = f.projectId)
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

CREATE TRIGGER feature_place_scope_update BEFORE UPDATE ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerProjectId IS NULL OR p.ownerProjectId = f.projectId)
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

-- Moving a Feature must not carry a private baseline into another project.
CREATE TRIGGER feature_place_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featurePlace fp JOIN place p ON p.id = fp.placeId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.ownerProjectId IS NOT NULL AND p.ownerProjectId IS NOT NEW.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

-- Ownership changes cannot invalidate associations that were previously valid.
CREATE TRIGGER feature_place_owner_scope BEFORE UPDATE OF ownerProjectId ON place
WHEN NEW.ownerProjectId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featurePlace fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.placeId = OLD.id AND f.projectId IS NOT NEW.ownerProjectId
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

CREATE TABLE placeMergeReview (
  id TEXT PRIMARY KEY NOT NULL,
  identityReviewId TEXT NOT NULL REFERENCES placeIdentityReview(id) ON DELETE RESTRICT,
  targetPlaceId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  sourcePlaceId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  targetBaseline TEXT NOT NULL CHECK(json_valid(targetBaseline)),
  sourceBaseline TEXT NOT NULL CHECK(json_valid(sourceBaseline)),
  sourceFeatureToken TEXT NOT NULL CHECK(json_valid(sourceFeatureToken)),
  sourceFeatureCount INTEGER NOT NULL CHECK(sourceFeatureCount>=0),
  sourceRevisionId TEXT NOT NULL,
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(sourcePlaceId,sourceRevisionId) REFERENCES placeRevision(placeId,id),
  CHECK(sourcePlaceId!=targetPlaceId)
);
CREATE TABLE placeRedirect (
  sourcePlaceId TEXT PRIMARY KEY NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  targetPlaceId TEXT NOT NULL REFERENCES place(id) ON DELETE RESTRICT,
  id TEXT NOT NULL UNIQUE,
  sourceSsId TEXT,
  reviewId TEXT NOT NULL UNIQUE REFERENCES placeMergeReview(id) ON DELETE RESTRICT,
  actorId TEXT NOT NULL CHECK(length(trim(actorId))>0),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(sourcePlaceId!=targetPlaceId)
);
CREATE INDEX place_redirect_target ON placeRedirect(targetPlaceId,sourcePlaceId);
CREATE TRIGGER place_redirect_insert BEFORE INSERT ON placeRedirect
WHEN NOT EXISTS(SELECT 1 FROM place s JOIN place t ON t.id=NEW.targetPlaceId
  WHERE s.id=NEW.sourcePlaceId AND s.state!='redirect' AND t.state!='redirect')
BEGIN SELECT RAISE(ABORT,'Place redirects require two current identities'); END;
CREATE TRIGGER place_redirect_no_initial BEFORE INSERT ON place
WHEN NEW.state='redirect'
BEGIN SELECT RAISE(ABORT,'Place redirects must retain an existing identity'); END;
CREATE TRIGGER place_redirect_state BEFORE UPDATE OF state ON place
WHEN NEW.state='redirect' AND
  (NOT EXISTS(SELECT 1 FROM placeRedirect WHERE sourcePlaceId=NEW.id) OR
   EXISTS(SELECT 1 FROM featurePlace WHERE placeId=NEW.id))
BEGIN SELECT RAISE(ABORT,'Place redirect requires retained identity and migrated associations'); END;
CREATE TRIGGER place_redirect_no_reactivate BEFORE UPDATE ON place
WHEN OLD.state='redirect'
BEGIN SELECT RAISE(ABORT,'Redirected Place identities are immutable'); END;
CREATE TRIGGER place_redirect_no_update BEFORE UPDATE ON placeRedirect
BEGIN SELECT RAISE(ABORT,'Place redirects are immutable'); END;
CREATE TRIGGER place_redirect_no_delete BEFORE DELETE ON placeRedirect
BEGIN SELECT RAISE(ABORT,'Place redirects are immutable'); END;
CREATE TRIGGER place_merge_review_no_update BEFORE UPDATE ON placeMergeReview
BEGIN SELECT RAISE(ABORT,'Place merge reviews are immutable'); END;
CREATE TRIGGER place_merge_review_no_delete BEFORE DELETE ON placeMergeReview
BEGIN SELECT RAISE(ABORT,'Place merge reviews are immutable'); END;

-- Rebuilding a RESTRICT parent can leave SQLite's deferred counter stale. Verify every
-- actual relationship before clearing that counter; never disable foreign_keys.
CREATE TABLE place_redirect_validation(valid INTEGER CHECK(valid=1));
INSERT INTO place_redirect_validation
SELECT CASE WHEN EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE 1 END;
DROP TABLE place_redirect_validation;
PRAGMA defer_foreign_keys=OFF;
