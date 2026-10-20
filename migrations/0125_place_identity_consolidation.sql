-- Identity comparisons own merge impact and rejection; absorbed Places own redirects. Refs #194.
-- spec/breadline/proposal/01-places-features.md
DROP TRIGGER place_identity_review_no_update;
DROP TRIGGER place_redirect_no_reactivate;
DROP TRIGGER place_redirect_state;
DROP TRIGGER place_redirect_no_initial;
DROP TRIGGER place_identity_history_not_rejected;
ALTER TABLE placeIdentityReview ADD COLUMN mergeReviews TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(mergeReviews) AND json_type(mergeReviews)='array');
ALTER TABLE placeIdentityReview ADD COLUMN rejection TEXT
  CHECK(rejection IS NULL OR (json_valid(rejection) AND json_type(rejection)='object'
    AND json_extract(rejection,'$.reviewId') IS id AND json_extract(rejection,'$.placeId') IS placeId
    AND json_extract(rejection,'$.ssId') IS json_extract(projection,'$.ssId')
    AND COALESCE(length(trim(json_extract(rejection,'$.actorId')))>0,0)
    AND COALESCE(length(trim(json_extract(rejection,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(rejection,'$.createdAt') IS 'text'));
UPDATE placeIdentityReview SET mergeReviews=(SELECT json_group_array(json_object(
  'id',m.id,'identityReviewId',m.identityReviewId,'targetPlaceId',m.targetPlaceId,'sourcePlaceId',m.sourcePlaceId,
  'targetBaseline',json(m.targetBaseline),'sourceBaseline',json(m.sourceBaseline),
  'sourceFeatureToken',m.sourceFeatureToken,'sourceFeatureCount',m.sourceFeatureCount,
  'sourceRevisionId',m.sourceRevisionId,'actorId',m.actorId,'createdAt',m.createdAt))
  FROM (SELECT * FROM placeMergeReview ORDER BY rowid) m WHERE m.identityReviewId=placeIdentityReview.id);
UPDATE placeIdentityReview SET rejection=(SELECT json_object(
  'reviewId',r.reviewId,'placeId',r.placeId,'ssId',r.ssId,'actorId',r.actorId,'reason',r.reason,'createdAt',r.createdAt)
  FROM placeIdentityRejection r WHERE r.reviewId=placeIdentityReview.id);
ALTER TABLE place ADD COLUMN redirectTargetId TEXT REFERENCES place(id) ON DELETE RESTRICT;
ALTER TABLE place ADD COLUMN redirect TEXT CHECK(redirect IS NULL OR (json_valid(redirect)
  AND json_extract(redirect,'$.sourcePlaceId') IS id
  AND json_extract(redirect,'$.targetPlaceId') IS redirectTargetId
  AND redirectTargetId IS NOT NULL AND redirectTargetId!=id
  AND json_type(redirect,'$.id') IS 'text' AND json_type(redirect,'$.reviewId') IS 'text'
  AND COALESCE(length(trim(json_extract(redirect,'$.actorId')))>0,0)
  AND COALESCE(length(trim(json_extract(redirect,'$.reason'))) BETWEEN 1 AND 2000,0)
  AND json_type(redirect,'$.createdAt') IS 'text'));
UPDATE place SET redirectTargetId=(SELECT targetPlaceId FROM placeRedirect WHERE sourcePlaceId=place.id),
  redirect=(SELECT json_object('sourcePlaceId',sourcePlaceId,'targetPlaceId',targetPlaceId,'id',id,
    'sourceSsId',sourceSsId,'reviewId',reviewId,'actorId',actorId,'reason',reason,'createdAt',createdAt)
    FROM placeRedirect WHERE sourcePlaceId=place.id) WHERE state='redirect';
CREATE INDEX place_redirect_destination ON place(redirectTargetId) WHERE redirectTargetId IS NOT NULL;
CREATE UNIQUE INDEX place_redirect_receipt ON place(json_extract(redirect,'$.id')) WHERE redirect IS NOT NULL;
CREATE UNIQUE INDEX place_redirect_review ON place(json_extract(redirect,'$.reviewId')) WHERE redirect IS NOT NULL;
DROP TABLE placeIdentityRejection;
DROP TABLE placeRedirect;
DROP TABLE placeMergeReview;

-- Existing evidence is immutable; merge assessments may only be appended.
CREATE TRIGGER place_identity_review_no_update BEFORE UPDATE ON placeIdentityReview
WHEN NEW.id IS NOT OLD.id OR NEW.placeId IS NOT OLD.placeId OR NEW.ownerProjectId IS NOT OLD.ownerProjectId
  OR NEW.baseline IS NOT OLD.baseline OR NEW.projection IS NOT OLD.projection
  OR NEW.actorId IS NOT OLD.actorId OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.rejection IS NOT NULL AND NEW.rejection IS NOT OLD.rejection)
  OR json_array_length(NEW.mergeReviews)<json_array_length(OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(OLD.mergeReviews) old
    WHERE json_extract(NEW.mergeReviews,'$['||old.key||']') IS NOT old.value)
BEGIN SELECT RAISE(ABORT,'Place identity evidence and decisions are immutable'); END;
CREATE TRIGGER place_identity_merge_valid BEFORE UPDATE OF mergeReviews ON placeIdentityReview
WHEN (NEW.rejection IS NOT NULL AND NEW.mergeReviews IS NOT OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(NEW.mergeReviews) m WHERE
  json_extract(m.value,'$.identityReviewId') IS NOT NEW.id
  OR json_extract(m.value,'$.targetPlaceId') IS NOT NEW.placeId
  OR json_extract(m.value,'$.sourcePlaceId') IS NEW.placeId
  OR NOT EXISTS(SELECT 1 FROM placeRevision pr WHERE pr.placeId=json_extract(m.value,'$.sourcePlaceId')
    AND pr.id=json_extract(m.value,'$.sourceRevisionId')))
BEGIN SELECT RAISE(ABORT,'Invalid Place merge evidence'); END;
CREATE TRIGGER place_identity_rejection_valid BEFORE UPDATE OF rejection ON placeIdentityReview
WHEN NEW.rejection IS NOT NULL AND (EXISTS(SELECT 1 FROM placeIdentityHistory WHERE reviewId=NEW.id)
  OR EXISTS(SELECT 1 FROM place p,json_each(NEW.mergeReviews) m
    WHERE json_extract(p.redirect,'$.reviewId')=json_extract(m.value,'$.id')))
BEGIN SELECT RAISE(ABORT,'Place identity review cannot be rejected'); END;
CREATE TRIGGER place_identity_history_not_rejected BEFORE INSERT ON placeIdentityHistory
WHEN EXISTS(SELECT 1 FROM placeIdentityReview WHERE id=NEW.reviewId AND rejection IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Place identity review was rejected'); END;
CREATE TRIGGER place_redirect_no_initial BEFORE INSERT ON place
WHEN NEW.state='redirect' OR NEW.redirect IS NOT NULL OR NEW.redirectTargetId IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Place redirects must retain an existing identity'); END;
CREATE TRIGGER place_redirect_target_immutable BEFORE UPDATE OF redirectTargetId ON place
WHEN OLD.redirect IS NOT NULL AND NEW.redirectTargetId IS NOT OLD.redirectTargetId
BEGIN SELECT RAISE(ABORT,'Place redirects are immutable'); END;
CREATE TRIGGER place_redirect_valid BEFORE UPDATE OF redirect,redirectTargetId ON place
WHEN NEW.redirect IS NOT OLD.redirect AND (OLD.redirect IS NOT NULL OR OLD.state='redirect'
  OR NOT EXISTS(SELECT 1 FROM place WHERE id=NEW.redirectTargetId AND state!='redirect')
  OR NOT EXISTS(SELECT 1 FROM placeIdentityReview r,json_each(r.mergeReviews) m
    WHERE json_extract(m.value,'$.id')=json_extract(NEW.redirect,'$.reviewId') AND r.rejection IS NULL
      AND json_extract(m.value,'$.sourcePlaceId')=NEW.id AND r.placeId=NEW.redirectTargetId))
BEGIN SELECT RAISE(ABORT,'Place redirect requires an unrejected review and two current identities'); END;
CREATE TRIGGER place_redirect_state BEFORE UPDATE OF state ON place
WHEN NEW.state='redirect' AND (NEW.redirect IS NULL OR NEW.redirectTargetId IS NULL
  OR EXISTS(SELECT 1 FROM featurePlace WHERE placeId=NEW.id))
BEGIN SELECT RAISE(ABORT,'Place redirect requires retained identity and migrated associations'); END;
CREATE TRIGGER place_redirect_no_reactivate BEFORE UPDATE ON place WHEN OLD.state='redirect'
BEGIN SELECT RAISE(ABORT,'Redirected Place identities are immutable'); END;
CREATE TRIGGER place_redirect_no_delete BEFORE DELETE ON place WHEN OLD.redirect IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Place redirects are immutable'); END;
