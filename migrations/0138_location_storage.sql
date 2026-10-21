-- Refs #194. Replace the generic Place lifecycle with Location, preserving identities and history.

-- Source payloads and upstream Places resource vocabulary are deliberately retained.

PRAGMA defer_foreign_keys=ON;

DROP TRIGGER "place_revision_no_delete";

DROP TRIGGER "place_revision_no_update";

DROP TRIGGER "feature_place_revision_update";

DROP TRIGGER "feature_place_revision_insert";

DROP TRIGGER "feature_place_history_insert";

DROP TRIGGER "feature_place_history_update";

DROP TRIGGER "feature_place_history_no_update";

DROP TRIGGER "feature_place_history_no_delete";

DROP TRIGGER "place_adoption_proposal_no_delete";

DROP TRIGGER "place_identity_history_no_update";

DROP TRIGGER "place_identity_history_no_delete";

DROP TRIGGER "feature_place_clear_detached";

DROP TRIGGER "feature_place_history_delete";

DROP TRIGGER "place_adoption_proposal_no_update";

DROP TRIGGER "place_identity_history_not_rejected";

DROP TRIGGER "place_identity_review_no_delete";

DROP TRIGGER "feature_place_scope_insert";

DROP TRIGGER "feature_place_scope_update";

DROP TRIGGER "feature_place_feature_scope";

DROP TRIGGER "feature_place_owner_scope";

DROP TRIGGER "place_identity_review_no_update";

DROP TRIGGER "place_identity_merge_valid";

DROP TRIGGER "place_identity_rejection_valid";

DROP TRIGGER "place_redirect_no_initial";

DROP TRIGGER "place_redirect_target_immutable";

DROP TRIGGER "place_redirect_valid";

DROP TRIGGER "place_redirect_state";

DROP TRIGGER "place_redirect_no_reactivate";

DROP TRIGGER "place_redirect_no_delete";

DROP TRIGGER "feature_place_project_scope";

ALTER TABLE project RENAME COLUMN placePolicy TO locationPolicy;

ALTER TABLE project RENAME COLUMN placePolicyRevision TO locationPolicyRevision;

ALTER TABLE feature RENAME COLUMN localPlaceBrands TO localLocationBrands;

CREATE TABLE "location" (
  id TEXT PRIMARY KEY NOT NULL,
  ssId TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (kind IN ('unknown', 'establishment', 'building', 'natural')),
  ownerOrganisationId TEXT REFERENCES organisation(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('linked','unresolved','manual','redirect')),
  sourceAvailability TEXT NOT NULL DEFAULT 'current' CHECK(sourceAvailability IN ('current','missing','review')),
  redirectTargetId TEXT REFERENCES "location"(id) ON DELETE RESTRICT,
  redirect TEXT CHECK(redirect IS NULL OR (json_valid(redirect)
    AND json_extract(redirect,'$.sourceLocationId') IS id
    AND json_extract(redirect,'$.targetLocationId') IS redirectTargetId
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

CREATE TABLE locationRevision (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
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
  UNIQUE (locationId, id),
  UNIQUE (locationId, sequence),
  CHECK (origin = 'local' OR (ssId IS NOT NULL AND apiVersion IS NOT NULL AND releaseId IS NOT NULL AND snapshotId IS NOT NULL))
);

CREATE TABLE featureLocation (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  factsRevisionId TEXT NOT NULL,
  locationRevisionId TEXT NOT NULL,
  overrides TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides)),
  revision TEXT NOT NULL DEFAULT 'initial',
  actorId TEXT,
  FOREIGN KEY (locationId, factsRevisionId) REFERENCES locationRevision(locationId, id),
  FOREIGN KEY (locationId, locationRevisionId) REFERENCES locationRevision(locationId, id)
);

CREATE TABLE featureLocationHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  featureId TEXT NOT NULL,
  revision TEXT NOT NULL,
  previousRevision TEXT,
  action TEXT NOT NULL CHECK (action IN ('baseline', 'link', 'update', 'unlink')),
  locationId TEXT NOT NULL,
  factsRevisionId TEXT NOT NULL,
  locationRevisionId TEXT NOT NULL,
  overrides TEXT NOT NULL CHECK (json_valid(overrides)),
  actorId TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE locationAdoptionProposal (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  locationId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  associationRevision TEXT NOT NULL,
  featureModifiedAt TEXT NOT NULL,
  policyRevision INTEGER NOT NULL CHECK(policyRevision >= 0),
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  factsDecision TEXT
  CHECK (factsDecision IS NULL OR (json_valid(factsDecision) AND json_type(factsDecision)='object'
    AND json_extract(factsDecision,'$.proposalId') IS id
    AND json_extract(factsDecision,'$.fieldGroup') IS 'facts'
    AND COALESCE(json_extract(factsDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(factsDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(factsDecision,'$.id') IS 'text' AND json_type(factsDecision,'$.actorId') IS 'text'
    AND json_type(factsDecision,'$.associationRevision') IS 'text' AND json_type(factsDecision,'$.createdAt') IS 'text')),
  locationDecision TEXT
  CHECK (locationDecision IS NULL OR (json_valid(locationDecision) AND json_type(locationDecision)='object'
    AND json_extract(locationDecision,'$.proposalId') IS id
    AND json_extract(locationDecision,'$.fieldGroup') IS 'location'
    AND COALESCE(json_extract(locationDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(locationDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(locationDecision,'$.id') IS 'text' AND json_type(locationDecision,'$.actorId') IS 'text'
    AND json_type(locationDecision,'$.associationRevision') IS 'text' AND json_type(locationDecision,'$.createdAt') IS 'text')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(featureId, projectId, locationId, candidateRevisionId, associationRevision, featureModifiedAt, policyRevision)
);

CREATE TABLE locationIdentityHistory (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  previousHistoryId TEXT REFERENCES locationIdentityHistory(id) ON DELETE RESTRICT,
  previousState TEXT NOT NULL CHECK (previousState IN ('manual','unresolved','linked')),
  previousSsId TEXT,
  ssId TEXT NOT NULL,
  sourceRevisionId TEXT NOT NULL,
  actorId TEXT NOT NULL CHECK (length(trim(actorId)) > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  reviewId TEXT REFERENCES locationIdentityReview(id) ON DELETE RESTRICT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(locationId,sourceRevisionId) REFERENCES locationRevision(locationId,id),
  CHECK ((previousState = 'linked' AND previousSsId IS NOT NULL) OR
    (previousState != 'linked' AND previousSsId IS NULL))
);

CREATE TABLE locationIdentityReview (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  ownerOrganisationId TEXT,
  baseline TEXT NOT NULL CHECK (json_valid(baseline)),
  projection TEXT NOT NULL CHECK (json_valid(projection)),
  actorId TEXT NOT NULL CHECK (length(trim(actorId)) > 0),
  mergeReviews TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(mergeReviews) AND json_type(mergeReviews)='array'),
  rejection TEXT
  CHECK(rejection IS NULL OR (json_valid(rejection) AND json_type(rejection)='object'
    AND json_extract(rejection,'$.reviewId') IS id AND json_extract(rejection,'$.locationId') IS locationId
    AND json_extract(rejection,'$.ssId') IS json_extract(projection,'$.ssId')
    AND COALESCE(length(trim(json_extract(rejection,'$.actorId')))>0,0)
    AND COALESCE(length(trim(json_extract(rejection,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(rejection,'$.createdAt') IS 'text')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE locationRefresh (
  id INTEGER PRIMARY KEY CHECK(id=1),
  phase TEXT NOT NULL DEFAULT 'idle' CHECK(phase IN ('idle','scan','ready','review')),
  accepted TEXT CHECK(accepted IS NULL OR json_valid(accepted)),
  target TEXT CHECK(target IS NULL OR json_valid(target)),
  runId TEXT,
  checkedMonth TEXT,
  nextOffset INTEGER NOT NULL DEFAULT 0 CHECK(nextOffset>=0),
  total INTEGER CHECK(total IS NULL OR total>=0),
  lease TEXT,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  lastError TEXT,
  scanMode TEXT NOT NULL DEFAULT 'catalogue'
  CHECK(scanMode IN ('catalogue','identities'))
);

CREATE TABLE locationRefreshItem (
  runId TEXT NOT NULL,
  locationId TEXT NOT NULL,
  ssId TEXT NOT NULL,
  sourceOffset INTEGER,
  projection TEXT CHECK(projection IS NULL OR json_valid(projection)),
  status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','pending','processed','review')),
  revisionId TEXT,
  featureCursor TEXT NOT NULL DEFAULT '',
  reviewReason TEXT,
  outcomes TEXT NOT NULL DEFAULT '{}'
  CHECK(json_valid(outcomes) AND json_type(outcomes)='object'),
  PRIMARY KEY(runId, locationId),
  UNIQUE(runId, ssId)
);

INSERT INTO "location" ("id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind")
 SELECT "id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId",CASE WHEN json_type(CASE WHEN json_type("redirect", '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set("redirect", '$.sourceLocationId', json_extract("redirect", '$.sourcePlaceId')), '$.sourcePlaceId') ELSE "redirect" END, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type("redirect", '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set("redirect", '$.sourceLocationId', json_extract("redirect", '$.sourcePlaceId')), '$.sourcePlaceId') ELSE "redirect" END, '$.targetLocationId', json_extract(CASE WHEN json_type("redirect", '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set("redirect", '$.sourceLocationId', json_extract("redirect", '$.sourcePlaceId')), '$.sourcePlaceId') ELSE "redirect" END, '$.targetPlaceId')), '$.targetPlaceId') ELSE CASE WHEN json_type("redirect", '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set("redirect", '$.sourceLocationId', json_extract("redirect", '$.sourcePlaceId')), '$.sourcePlaceId') ELSE "redirect" END END,"createdAt","kind" FROM "place";

INSERT INTO "locationRevision" ("id","locationId","sequence","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","payload","facts","createdAt")
 SELECT "id","placeId","sequence","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","payload","facts","createdAt" FROM "placeRevision";

INSERT INTO "locationIdentityReview" ("id","locationId","ownerOrganisationId","baseline","projection","actorId","createdAt","mergeReviews","rejection")
 SELECT "id","placeId","ownerOrganisationId",CASE WHEN json_type("baseline", '$.placeId') IS NOT NULL THEN json_remove(json_set("baseline", '$.locationId', json_extract("baseline", '$.placeId')), '$.placeId') ELSE "baseline" END,"projection","actorId","createdAt",(SELECT coalesce(json_group_array(json(CASE WHEN json_type(CASE WHEN json_type(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.locationId', json_extract(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId')), '$.targetBaseline.placeId') ELSE CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END END, '$.sourceBaseline.placeId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.locationId', json_extract(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId')), '$.targetBaseline.placeId') ELSE CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END END, '$.sourceBaseline.locationId', json_extract(CASE WHEN json_type(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.locationId', json_extract(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId')), '$.targetBaseline.placeId') ELSE CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END END, '$.sourceBaseline.placeId')), '$.sourceBaseline.placeId') ELSE CASE WHEN json_type(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.locationId', json_extract(CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END, '$.targetBaseline.placeId')), '$.targetBaseline.placeId') ELSE CASE WHEN json_type(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId') IS NOT NULL THEN json_remove(json_set(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourceLocationId', json_extract(CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END, '$.sourcePlaceId')), '$.sourcePlaceId') ELSE CASE WHEN json_type(value, '$.targetPlaceId') IS NOT NULL THEN json_remove(json_set(value, '$.targetLocationId', json_extract(value, '$.targetPlaceId')), '$.targetPlaceId') ELSE value END END END END)), '[]') FROM json_each(mergeReviews)),CASE WHEN json_type("rejection", '$.placeId') IS NOT NULL THEN json_remove(json_set("rejection", '$.locationId', json_extract("rejection", '$.placeId')), '$.placeId') ELSE "rejection" END FROM "placeIdentityReview";

INSERT INTO "locationIdentityHistory" ("id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","createdAt","reviewId")
 SELECT "id","placeId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","createdAt","reviewId" FROM "placeIdentityHistory";

INSERT INTO "featureLocation" ("featureId","locationId","factsRevisionId","locationRevisionId","overrides","revision","actorId")
 SELECT "featureId","placeId","factsRevisionId","locationRevisionId","overrides","revision","actorId" FROM "featurePlace";

INSERT INTO "featureLocationHistory" ("id","featureId","revision","previousRevision","action","locationId","factsRevisionId","locationRevisionId","overrides","actorId","createdAt")
 SELECT "id","featureId","revision","previousRevision","action","placeId","factsRevisionId","locationRevisionId","overrides","actorId","createdAt" FROM "featurePlaceHistory";

INSERT INTO "locationAdoptionProposal" ("id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","createdAt","factsDecision","locationDecision")
 SELECT "id","featureId","projectId","placeId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","createdAt","factsDecision","locationDecision" FROM "placeAdoptionProposal";

INSERT INTO "locationRefresh" ("id","phase","accepted","target","runId","checkedMonth","nextOffset","total","lease","leaseUntil","retryAt","failures","lastError","scanMode")
 SELECT "id","phase","accepted","target","runId","checkedMonth","nextOffset","total","lease","leaseUntil","retryAt","failures","lastError","scanMode" FROM "placeRefresh";

INSERT INTO "locationRefreshItem" ("runId","locationId","ssId","sourceOffset","projection","status","revisionId","featureCursor","reviewReason","outcomes")
 SELECT "runId","placeId","ssId","sourceOffset","projection","status","revisionId","featureCursor","reviewReason","outcomes" FROM "placeRefreshItem";

DROP TABLE "featurePlace";

DROP TABLE "featurePlaceHistory";

DROP TABLE "placeAdoptionProposal";

DROP TABLE "placeIdentityHistory";

DROP TABLE "placeIdentityReview";

DROP TABLE "placeRevision";

DROP TABLE "placeRefreshItem";

DROP TABLE "placeRefresh";

DROP TABLE "place";

CREATE INDEX feature_location_location ON featureLocation(locationId, featureId);

CREATE UNIQUE INDEX feature_location_history_revision ON featureLocationHistory(featureId, revision)
  WHERE action != 'unlink';

CREATE INDEX feature_location_history_feature ON featureLocationHistory(featureId, id);

CREATE INDEX location_adoption_project ON locationAdoptionProposal(projectId, featureId);

CREATE INDEX location_refresh_item_work ON locationRefreshItem(runId,status,locationId);

CREATE INDEX location_identity_history_location ON locationIdentityHistory(locationId,createdAt,id);

CREATE UNIQUE INDEX location_identity_history_previous ON locationIdentityHistory(previousHistoryId)
  WHERE previousHistoryId IS NOT NULL;

CREATE UNIQUE INDEX location_identity_history_initial ON locationIdentityHistory(locationId)
  WHERE previousHistoryId IS NULL;

CREATE INDEX location_identity_review_location ON locationIdentityReview(locationId,createdAt,id);

CREATE INDEX location_redirect_destination ON location(redirectTargetId) WHERE redirectTargetId IS NOT NULL;

CREATE UNIQUE INDEX location_redirect_receipt ON location(json_extract(redirect,'$.id')) WHERE redirect IS NOT NULL;

CREATE UNIQUE INDEX location_redirect_review ON location(json_extract(redirect,'$.reviewId')) WHERE redirect IS NOT NULL;

CREATE INDEX location_owner_organisation ON location(ownerOrganisationId,id);

CREATE TRIGGER location_revision_no_delete BEFORE DELETE ON locationRevision
BEGIN SELECT RAISE(ABORT, 'Location revisions are immutable'); END;

CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT, 'Location revisions are immutable'); END;

CREATE TRIGGER feature_location_revision_update BEFORE UPDATE ON featureLocation
WHEN NEW.featureId != OLD.featureId OR NEW.revision = OLD.revision OR length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location update requires a new revision'); END;

CREATE TRIGGER feature_location_revision_insert BEFORE INSERT ON featureLocation
WHEN length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location revision is required'); END;

CREATE TRIGGER feature_location_history_insert AFTER INSERT ON featureLocation
BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,action,locationId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES (NEW.featureId,NEW.revision,'link',NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.overrides,NEW.actorId);
END;

CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation
BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,previousRevision,action,locationId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES (NEW.featureId,NEW.revision,OLD.revision,'update',NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.overrides,NEW.actorId);
END;

CREATE TRIGGER feature_location_history_no_update BEFORE UPDATE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;

CREATE TRIGGER feature_location_history_no_delete BEFORE DELETE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;

CREATE TRIGGER location_adoption_proposal_no_delete BEFORE DELETE ON locationAdoptionProposal
BEGIN SELECT RAISE(ABORT,'Location adoption evidence is immutable'); END;

CREATE TRIGGER location_identity_history_no_update BEFORE UPDATE ON locationIdentityHistory
BEGIN SELECT RAISE(ABORT,'Location identity history is immutable'); END;

CREATE TRIGGER location_identity_history_no_delete BEFORE DELETE ON locationIdentityHistory
BEGIN SELECT RAISE(ABORT,'Location identity history is immutable'); END;

CREATE TRIGGER feature_location_clear_detached AFTER INSERT ON featureLocation BEGIN
  UPDATE feature SET localLocationBrands=NULL WHERE id=NEW.featureId AND localLocationBrands IS NOT NULL;
END;

CREATE TRIGGER feature_location_history_delete AFTER DELETE ON featureLocation BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,previousRevision,action,locationId,factsRevisionId,locationRevisionId,overrides,actorId)
  VALUES(OLD.featureId,OLD.revision,OLD.revision,'unlink',OLD.locationId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.overrides,
    (SELECT json_extract(localLocationBrands,'$.actorId') FROM feature WHERE id=OLD.featureId
      AND json_extract(localLocationBrands,'$.sourceAssociationRevision')=OLD.revision));
END;

CREATE TRIGGER location_adoption_proposal_no_update BEFORE UPDATE ON locationAdoptionProposal
WHEN NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.locationId IS NOT OLD.locationId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Location adoption evidence and decisions are immutable'); END;

CREATE TRIGGER location_identity_history_not_rejected BEFORE INSERT ON locationIdentityHistory
WHEN EXISTS(SELECT 1 FROM locationIdentityReview WHERE id=NEW.reviewId AND rejection IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Location identity review was rejected'); END;

CREATE TRIGGER location_identity_review_no_delete BEFORE DELETE ON locationIdentityReview
BEGIN SELECT RAISE(ABORT,'Location identity review is immutable'); END;

CREATE TRIGGER feature_location_scope_insert BEFORE INSERT ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_scope_update BEFORE UPDATE ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featureLocation fp JOIN location p ON p.id = fp.locationId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.ownerOrganisationId IS NOT NULL AND p.ownerOrganisationId IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId)))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_owner_scope BEFORE UPDATE OF ownerOrganisationId ON location
WHEN NEW.ownerOrganisationId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featureLocation fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.locationId = OLD.id AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT NEW.ownerOrganisationId
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER location_identity_review_no_update BEFORE UPDATE ON locationIdentityReview
WHEN NEW.id IS NOT OLD.id OR NEW.locationId IS NOT OLD.locationId OR NEW.ownerOrganisationId IS NOT OLD.ownerOrganisationId
  OR NEW.baseline IS NOT OLD.baseline OR NEW.projection IS NOT OLD.projection
  OR NEW.actorId IS NOT OLD.actorId OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.rejection IS NOT NULL AND NEW.rejection IS NOT OLD.rejection)
  OR json_array_length(NEW.mergeReviews)<json_array_length(OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(OLD.mergeReviews) old
    WHERE json_extract(NEW.mergeReviews,'$['||old.key||']') IS NOT old.value)
BEGIN SELECT RAISE(ABORT,'Location identity evidence and decisions are immutable'); END;

CREATE TRIGGER location_identity_merge_valid BEFORE UPDATE OF mergeReviews ON locationIdentityReview
WHEN (NEW.rejection IS NOT NULL AND NEW.mergeReviews IS NOT OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(NEW.mergeReviews) m WHERE
  json_extract(m.value,'$.identityReviewId') IS NOT NEW.id
  OR json_extract(m.value,'$.targetLocationId') IS NOT NEW.locationId
  OR json_extract(m.value,'$.sourceLocationId') IS NEW.locationId
  OR NOT EXISTS(SELECT 1 FROM locationRevision pr WHERE pr.locationId=json_extract(m.value,'$.sourceLocationId')
    AND pr.id=json_extract(m.value,'$.sourceRevisionId')))
BEGIN SELECT RAISE(ABORT,'Invalid Location merge evidence'); END;

CREATE TRIGGER location_identity_rejection_valid BEFORE UPDATE OF rejection ON locationIdentityReview
WHEN NEW.rejection IS NOT NULL AND (EXISTS(SELECT 1 FROM locationIdentityHistory WHERE reviewId=NEW.id)
  OR EXISTS(SELECT 1 FROM location p,json_each(NEW.mergeReviews) m
    WHERE json_extract(p.redirect,'$.reviewId')=json_extract(m.value,'$.id')))
BEGIN SELECT RAISE(ABORT,'Location identity review cannot be rejected'); END;

CREATE TRIGGER location_redirect_no_initial BEFORE INSERT ON location
WHEN NEW.state='redirect' OR NEW.redirect IS NOT NULL OR NEW.redirectTargetId IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Location redirects must retain an existing identity'); END;

CREATE TRIGGER location_redirect_target_immutable BEFORE UPDATE OF redirectTargetId ON location
WHEN OLD.redirect IS NOT NULL AND NEW.redirectTargetId IS NOT OLD.redirectTargetId
BEGIN SELECT RAISE(ABORT,'Location redirects are immutable'); END;

CREATE TRIGGER location_redirect_valid BEFORE UPDATE OF redirect,redirectTargetId ON location
WHEN NEW.redirect IS NOT OLD.redirect AND (OLD.redirect IS NOT NULL OR OLD.state='redirect'
  OR NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.redirectTargetId AND state!='redirect')
  OR NOT EXISTS(SELECT 1 FROM locationIdentityReview r,json_each(r.mergeReviews) m
    WHERE json_extract(m.value,'$.id')=json_extract(NEW.redirect,'$.reviewId') AND r.rejection IS NULL
      AND json_extract(m.value,'$.sourceLocationId')=NEW.id AND r.locationId=NEW.redirectTargetId))
BEGIN SELECT RAISE(ABORT,'Location redirect requires an unrejected review and two current identities'); END;

CREATE TRIGGER location_redirect_state BEFORE UPDATE OF state ON location
WHEN NEW.state='redirect' AND (NEW.redirect IS NULL OR NEW.redirectTargetId IS NULL
  OR EXISTS(SELECT 1 FROM featureLocation WHERE locationId=NEW.id))
BEGIN SELECT RAISE(ABORT,'Location redirect requires retained identity and migrated associations'); END;

CREATE TRIGGER location_redirect_no_reactivate BEFORE UPDATE ON location WHEN OLD.state='redirect'
BEGIN SELECT RAISE(ABORT,'Redirected Location identities are immutable'); END;

CREATE TRIGGER location_redirect_no_delete BEFORE DELETE ON location WHEN OLD.redirect IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Location redirects are immutable'); END;

CREATE TRIGGER feature_location_project_scope BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
  SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id JOIN location p ON p.id=fp.locationId
  WHERE f.projectId=OLD.id AND p.ownerOrganisationId IS NOT NULL AND p.ownerOrganisationId IS NOT NEW.organisationId)
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch'); END;
