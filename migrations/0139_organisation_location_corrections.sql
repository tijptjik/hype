-- Organisation-wide corrections; shared unmatched and private manual Locations. Refs #194.

-- Preserve accepted Feature projections; conflicts require explicit reconciliation.

DROP TRIGGER "feature_location_revision_update";

DROP TRIGGER "feature_location_revision_insert";

DROP TRIGGER "feature_location_history_insert";

DROP TRIGGER "feature_location_history_update";

DROP TRIGGER "feature_location_history_no_update";

DROP TRIGGER "feature_location_history_no_delete";

DROP TRIGGER "location_adoption_proposal_no_delete";

DROP TRIGGER "feature_location_clear_detached";

DROP TRIGGER "feature_location_history_delete";

DROP TRIGGER "location_adoption_proposal_no_update";

DROP TRIGGER "feature_location_scope_insert";

DROP TRIGGER "feature_location_scope_update";

DROP TRIGGER "feature_location_feature_scope";

DROP TRIGGER "feature_location_owner_scope";

DROP TRIGGER "location_identity_review_no_update";

DROP TRIGGER "feature_location_project_scope";

ALTER TABLE featureLocation RENAME COLUMN overrides TO acceptedOverrides;

ALTER TABLE featureLocationHistory RENAME COLUMN overrides TO acceptedOverrides;

ALTER TABLE featureLocation ADD COLUMN factsOrganisationRevision TEXT;

ALTER TABLE featureLocation ADD COLUMN locationOrganisationRevision TEXT;

ALTER TABLE featureLocationHistory ADD COLUMN factsOrganisationRevision TEXT;

ALTER TABLE featureLocationHistory ADD COLUMN locationOrganisationRevision TEXT;

CREATE TABLE organisationLocation (
 organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE RESTRICT,
 locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
 revision TEXT NOT NULL UNIQUE,
 overrides TEXT NOT NULL CHECK(json_valid(overrides)),
 history TEXT NOT NULL CHECK(json_valid(history) AND json_type(history)='array'),
 actorId TEXT NOT NULL,
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(organisationId,locationId)
);

-- D1 disallows TEMP tables; this transactional guard is dropped after validation.
CREATE TABLE _organisation_location_guard(v INTEGER CHECK(v=1));
INSERT INTO _organisation_location_guard
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM featureLocation fp JOIN feature f ON f.id=fp.featureId JOIN project pr ON pr.id=f.projectId
 GROUP BY pr.organisationId,fp.locationId HAVING count(DISTINCT fp.acceptedOverrides)>1) THEN 1 ELSE 0 END;
DROP TABLE _organisation_location_guard;
INSERT INTO organisationLocation(organisationId,locationId,revision,overrides,history,actorId)
SELECT pr.organisationId,fp.locationId,lower(hex(randomblob(6))),fp.acceptedOverrides,'[]',coalesce(fp.actorId,'system:organisation-location-migration')
FROM featureLocation fp JOIN feature f ON f.id=fp.featureId JOIN project pr ON pr.id=f.projectId
WHERE fp.acceptedOverrides!='{}' GROUP BY pr.organisationId,fp.locationId;
UPDATE organisationLocation SET history=json_array(json_object('revision',revision,'overrides',json(overrides),'actorId',actorId,'createdAt',createdAt));
UPDATE featureLocation SET factsOrganisationRevision=(SELECT revision FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id WHERE f.id=featureLocation.featureId AND o.locationId=featureLocation.locationId),
locationOrganisationRevision=(SELECT revision FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id WHERE f.id=featureLocation.featureId AND o.locationId=featureLocation.locationId);
-- Canonical identities are shared; their previous administrators remain in retained provenance.
UPDATE location SET ownerOrganisationId=NULL WHERE state='linked';

CREATE TABLE _next_locationAdoptionProposal (
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
  organisationRevision TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(featureId, projectId, locationId, candidateRevisionId, associationRevision, featureModifiedAt, policyRevision,organisationRevision)
);

INSERT INTO _next_locationAdoptionProposal(id,featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence,factsDecision,locationDecision,createdAt) SELECT id,featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence,factsDecision,locationDecision,createdAt FROM locationAdoptionProposal;

DROP TABLE locationAdoptionProposal;

ALTER TABLE _next_locationAdoptionProposal RENAME TO locationAdoptionProposal;

CREATE INDEX location_adoption_project ON locationAdoptionProposal(projectId, featureId);

CREATE TABLE _next_locationRefreshItem (
  runId TEXT NOT NULL,
  locationId TEXT NOT NULL,
  ssId TEXT,
  sourceOffset INTEGER,
  projection TEXT CHECK(projection IS NULL OR json_valid(projection)),
  status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','pending','processed','review')),
  revisionId TEXT,
  featureCursor TEXT NOT NULL DEFAULT '',
  reviewReason TEXT,
  outcomes TEXT NOT NULL DEFAULT '{}'
  CHECK(json_valid(outcomes) AND json_type(outcomes)='object'),
  origin TEXT NOT NULL DEFAULT 'source' CHECK(origin IN ('source','local')),
  organisationId TEXT,
  organisationRevision TEXT,
  actorId TEXT,
  PRIMARY KEY(runId, locationId),
  UNIQUE(runId, ssId)
);

INSERT INTO _next_locationRefreshItem(runId,locationId,ssId,sourceOffset,projection,status,revisionId,featureCursor,reviewReason,outcomes) SELECT runId,locationId,ssId,sourceOffset,projection,status,revisionId,featureCursor,reviewReason,outcomes FROM locationRefreshItem;

DROP TABLE locationRefreshItem;

ALTER TABLE _next_locationRefreshItem RENAME TO locationRefreshItem;

CREATE INDEX location_refresh_item_work ON locationRefreshItem(runId,status,locationId);

CREATE TRIGGER feature_location_revision_update BEFORE UPDATE ON featureLocation
WHEN NEW.featureId != OLD.featureId OR NEW.revision = OLD.revision OR length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location update requires a new revision'); END;

CREATE TRIGGER feature_location_revision_insert BEFORE INSERT ON featureLocation
WHEN length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location revision is required'); END;

CREATE TRIGGER feature_location_history_insert AFTER INSERT ON featureLocation
BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,action,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision)
  VALUES (NEW.featureId,NEW.revision,'link',NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision);
END;

CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation
BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,previousRevision,action,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision)
  VALUES (NEW.featureId,NEW.revision,OLD.revision,'update',NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision);
END;

CREATE TRIGGER feature_location_history_no_update BEFORE UPDATE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;

CREATE TRIGGER feature_location_history_no_delete BEFORE DELETE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;

CREATE TRIGGER location_adoption_proposal_no_delete BEFORE DELETE ON locationAdoptionProposal
BEGIN SELECT RAISE(ABORT,'Location adoption evidence is immutable'); END;

CREATE TRIGGER feature_location_clear_detached AFTER INSERT ON featureLocation BEGIN
  UPDATE feature SET localLocationBrands=NULL WHERE id=NEW.featureId AND localLocationBrands IS NOT NULL;
END;

CREATE TRIGGER feature_location_history_delete AFTER DELETE ON featureLocation BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,previousRevision,action,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision)
  VALUES(OLD.featureId,OLD.revision,OLD.revision,'unlink',OLD.locationId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.acceptedOverrides,
    (SELECT json_extract(localLocationBrands,'$.actorId') FROM feature WHERE id=OLD.featureId
      AND json_extract(localLocationBrands,'$.sourceAssociationRevision')=OLD.revision),OLD.factsOrganisationRevision,OLD.locationOrganisationRevision);
END;

CREATE TRIGGER location_adoption_proposal_no_update BEFORE UPDATE ON locationAdoptionProposal
WHEN NEW.organisationRevision IS NOT OLD.organisationRevision OR NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.locationId IS NOT OLD.locationId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Location adoption evidence and decisions are immutable'); END;

CREATE TRIGGER feature_location_scope_insert BEFORE INSERT ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.state!='manual' OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_scope_update BEFORE UPDATE ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.state!='manual' OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featureLocation fp JOIN location p ON p.id = fp.locationId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.state='manual' AND p.ownerOrganisationId IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId)))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_location_owner_scope BEFORE UPDATE OF ownerOrganisationId ON location
WHEN NEW.state='manual' AND NEW.ownerOrganisationId IS NOT NULL AND EXISTS (
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

CREATE TRIGGER feature_location_project_scope BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
  SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id JOIN location p ON p.id=fp.locationId
  WHERE f.projectId=OLD.id AND p.state='manual' AND p.ownerOrganisationId IS NOT NEW.organisationId)
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch'); END;

CREATE TRIGGER location_linked_shared_insert BEFORE INSERT ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;
CREATE TRIGGER location_linked_shared_update BEFORE UPDATE ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;
CREATE TRIGGER organisation_location_no_delete BEFORE DELETE ON organisationLocation
 BEGIN SELECT RAISE(ABORT,'Organisation Location corrections are retained'); END;
CREATE TRIGGER organisation_location_history BEFORE UPDATE ON organisationLocation
 WHEN NEW.organisationId IS NOT OLD.organisationId OR NEW.locationId IS NOT OLD.locationId OR NEW.createdAt IS NOT OLD.createdAt
 OR json_array_length(NEW.history)!=json_array_length(OLD.history)+1
 OR EXISTS(SELECT 1 FROM json_each(OLD.history) p WHERE json_extract(NEW.history,'$['||p.key||']') IS NOT p.value)
 OR json_extract(NEW.history,'$[#-1].revision') IS NOT NEW.revision
 OR json_extract(NEW.history,'$[#-1].overrides') IS NOT json(NEW.overrides)
 BEGIN SELECT RAISE(ABORT,'Organisation Location correction history is append-only'); END;
CREATE TRIGGER organisation_location_scope_insert BEFORE INSERT ON organisationLocation
 WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state!='redirect'
  AND (state!='manual' OR ownerOrganisationId=NEW.organisationId))
 BEGIN SELECT RAISE(ABORT,'Organisation Location scope mismatch'); END;
CREATE TRIGGER organisation_location_scope_update BEFORE UPDATE ON organisationLocation
 WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state!='redirect'
  AND (state!='manual' OR ownerOrganisationId=NEW.organisationId))
 BEGIN SELECT RAISE(ABORT,'Organisation Location scope mismatch'); END;
CREATE TRIGGER location_local_change AFTER INSERT ON locationRevision
 WHEN NEW.origin='local' AND NEW.sequence>1
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,revisionId,status,origin,actorId)
 SELECT 'local:'||NEW.id,NEW.locationId,NULL,NEW.id,'pending','local',json_extract(NEW.payload,'$.actorId'); END;
CREATE TRIGGER organisation_location_change_insert AFTER INSERT ON organisationLocation
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,status,origin,organisationId,organisationRevision,actorId)
 VALUES('local:'||NEW.revision,NEW.locationId,NULL,'pending','local',NEW.organisationId,NEW.revision,NEW.actorId); END;
CREATE TRIGGER organisation_location_change_update AFTER UPDATE ON organisationLocation
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,status,origin,organisationId,organisationRevision,actorId)
 VALUES('local:'||NEW.revision,NEW.locationId,NULL,'pending','local',NEW.organisationId,NEW.revision,NEW.actorId); END;
CREATE TRIGGER location_canonical_source_only BEFORE INSERT ON locationRevision
 WHEN NEW.origin!='saanseoi' AND EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state='linked')
 BEGIN SELECT RAISE(ABORT,'Canonical Location baselines are source-controlled'); END;
CREATE INDEX location_refresh_local_work ON locationRefreshItem(origin,status,runId,locationId);
