-- Private Places belong to Organisations; adoption policy remains per Project. Refs #194.
-- spec/breadline/proposal/01-places-features.md
-- Reject missing ancestry before converting ownership or retained comparison scopes.
CREATE TABLE __place_org_guard(valid INTEGER CHECK(valid=1));
INSERT INTO __place_org_guard SELECT NOT EXISTS (
  SELECT owner FROM (
    SELECT ownerProjectId AS owner FROM place UNION ALL
    SELECT ownerProjectId FROM placeIdentityReview UNION ALL
    SELECT json_extract(baseline,'$.expectedOwnerProjectId') FROM placeIdentityReview UNION ALL
    SELECT json_extract(m.value,'$.targetBaseline.expectedOwnerProjectId') FROM placeIdentityReview r,json_each(r.mergeReviews) m UNION ALL
    SELECT json_extract(m.value,'$.sourceBaseline.expectedOwnerProjectId') FROM placeIdentityReview r,json_each(r.mergeReviews) m
  ) owners WHERE owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM project pr JOIN organisation o ON o.id=pr.organisationId WHERE pr.id=owners.owner));
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER IF EXISTS place_identity_review_no_delete;
DROP TRIGGER IF EXISTS feature_place_scope_insert;
DROP TRIGGER IF EXISTS feature_place_scope_update;
DROP TRIGGER IF EXISTS feature_place_feature_scope;
DROP TRIGGER IF EXISTS feature_place_owner_scope;
DROP TRIGGER IF EXISTS place_identity_review_no_update;
DROP TRIGGER IF EXISTS place_identity_merge_valid;
DROP TRIGGER IF EXISTS place_identity_rejection_valid;
DROP TRIGGER IF EXISTS place_redirect_no_initial;
DROP TRIGGER IF EXISTS place_redirect_target_immutable;
DROP TRIGGER IF EXISTS place_redirect_valid;
DROP TRIGGER IF EXISTS place_redirect_state;
DROP TRIGGER IF EXISTS place_redirect_no_reactivate;
DROP TRIGGER IF EXISTS place_redirect_no_delete;
CREATE TABLE place_next (
  id TEXT PRIMARY KEY NOT NULL,
  ssId TEXT UNIQUE,
  ownerOrganisationId TEXT REFERENCES organisation(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('linked','unresolved','manual','redirect')),
  sourceAvailability TEXT NOT NULL DEFAULT 'current' CHECK(sourceAvailability IN ('current','missing','review')),
  redirectTargetId TEXT REFERENCES place_next(id) ON DELETE RESTRICT,
  redirect TEXT CHECK(redirect IS NULL OR (json_valid(redirect)
    AND json_extract(redirect,'$.sourcePlaceId') IS id
    AND json_extract(redirect,'$.targetPlaceId') IS redirectTargetId
    AND redirectTargetId IS NOT NULL AND redirectTargetId!=id
    AND json_type(redirect,'$.id') IS 'text' AND json_type(redirect,'$.reviewId') IS 'text'
    AND COALESCE(length(trim(json_extract(redirect,'$.actorId')))>0,0)
    AND COALESCE(length(trim(json_extract(redirect,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(redirect,'$.createdAt') IS 'text')),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK((state='linked' AND ssId IS NOT NULL) OR
    (state IN ('unresolved','manual') AND ssId IS NULL AND ownerOrganisationId IS NOT NULL) OR
    (state='redirect' AND ssId IS NULL))
);
INSERT INTO place_next(id,ssId,ownerOrganisationId,state,sourceAvailability,redirectTargetId,redirect,createdAt)
SELECT p.id,p.ssId,pr.organisationId,p.state,p.sourceAvailability,p.redirectTargetId,p.redirect,p.createdAt
FROM place p LEFT JOIN project pr ON pr.id=p.ownerProjectId;
DROP TABLE place;
ALTER TABLE place_next RENAME TO place;
CREATE INDEX place_redirect_destination ON place(redirectTargetId) WHERE redirectTargetId IS NOT NULL;
CREATE UNIQUE INDEX place_redirect_receipt ON place(json_extract(redirect,'$.id')) WHERE redirect IS NOT NULL;
CREATE UNIQUE INDEX place_redirect_review ON place(json_extract(redirect,'$.reviewId')) WHERE redirect IS NOT NULL;
CREATE INDEX place_owner_organisation ON place(ownerOrganisationId,id);
ALTER TABLE placeIdentityReview RENAME COLUMN ownerProjectId TO ownerOrganisationId;
UPDATE placeIdentityReview SET ownerOrganisationId=(SELECT organisationId FROM project WHERE id=placeIdentityReview.ownerOrganisationId);
-- Translate historical ownership tokens; other comparison evidence and decisions stay intact.
UPDATE placeIdentityReview SET baseline=json_remove(json_set(baseline,'$.expectedOwnerOrganisationId',
  (SELECT organisationId FROM project WHERE id=json_extract(placeIdentityReview.baseline,'$.expectedOwnerProjectId'))),'$.expectedOwnerProjectId');
UPDATE placeIdentityReview SET mergeReviews=(SELECT json_group_array(json(json_remove(json_set(m.value,
  '$.targetBaseline.expectedOwnerOrganisationId',(SELECT organisationId FROM project WHERE id=json_extract(m.value,'$.targetBaseline.expectedOwnerProjectId')),
  '$.sourceBaseline.expectedOwnerOrganisationId',(SELECT organisationId FROM project WHERE id=json_extract(m.value,'$.sourceBaseline.expectedOwnerProjectId'))),
  '$.targetBaseline.expectedOwnerProjectId','$.sourceBaseline.expectedOwnerProjectId')))
  FROM json_each(placeIdentityReview.mergeReviews) m);
CREATE TRIGGER place_identity_review_no_delete BEFORE DELETE ON placeIdentityReview
BEGIN SELECT RAISE(ABORT,'Place identity review is immutable'); END;
CREATE TRIGGER feature_place_scope_insert BEFORE INSERT ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;
CREATE TRIGGER feature_place_scope_update BEFORE UPDATE ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;
CREATE TRIGGER feature_place_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featurePlace fp JOIN place p ON p.id = fp.placeId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.ownerOrganisationId IS NOT NULL AND p.ownerOrganisationId IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId)))
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;
CREATE TRIGGER feature_place_owner_scope BEFORE UPDATE OF ownerOrganisationId ON place
WHEN NEW.ownerOrganisationId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featurePlace fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.placeId = OLD.id AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT NEW.ownerOrganisationId
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;
CREATE TRIGGER place_identity_review_no_update BEFORE UPDATE ON placeIdentityReview
WHEN NEW.id IS NOT OLD.id OR NEW.placeId IS NOT OLD.placeId OR NEW.ownerOrganisationId IS NOT OLD.ownerOrganisationId
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
-- Changing a Project's Organisation must not expose existing private Place associations.
CREATE TRIGGER feature_place_project_scope BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
  SELECT 1 FROM feature f JOIN featurePlace fp ON fp.featureId=f.id JOIN place p ON p.id=fp.placeId
  WHERE f.projectId=OLD.id AND p.ownerOrganisationId IS NOT NULL AND p.ownerOrganisationId IS NOT NEW.organisationId)
BEGIN SELECT RAISE(ABORT,'Feature Place scope mismatch'); END;
INSERT INTO __place_org_guard SELECT NOT EXISTS (
  SELECT 1 FROM featurePlace fp JOIN feature f ON f.id=fp.featureId JOIN place p ON p.id=fp.placeId
  LEFT JOIN project pr ON pr.id=f.projectId
  WHERE f.isDraft IS NOT 0 OR p.state='redirect' OR (p.ownerOrganisationId IS NOT NULL AND p.ownerOrganisationId IS NOT pr.organisationId));
INSERT INTO __place_org_guard SELECT NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE __place_org_guard;
-- SQLite's deferred RESTRICT counter can retain parent-rebuild debt after actual references validate.
PRAGMA defer_foreign_keys=OFF;
