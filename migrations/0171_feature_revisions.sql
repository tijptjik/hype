-- Additive revision storage. Existing application rows remain public projections until
-- each command/read path is migrated; this migration does not invent historical edits.
CREATE TABLE revisionChangeSet (
  id TEXT PRIMARY KEY NOT NULL,
  actorId TEXT NOT NULL CHECK(length(trim(actorId)) > 0),
  origin TEXT NOT NULL CHECK(origin IN ('user','system','import','migration','restore')),
  reason TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE featureRevision (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  mergedFromRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id) ON DELETE RESTRICT,
  schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion = 1),
  content TEXT NOT NULL CHECK(json_valid(content)),
  UNIQUE(featureId,id),
  FOREIGN KEY(featureId,previousRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(featureId,mergedFromRevisionId) REFERENCES featureRevision(featureId,id),
  CHECK(previousRevisionId IS NOT id AND mergedFromRevisionId IS NOT id)
);
CREATE TABLE featureRevisionHead (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  publishedRevisionId TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  redirectFeatureId TEXT REFERENCES feature(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0),
  FOREIGN KEY(featureId,publishedRevisionId) REFERENCES featureRevision(featureId,id),
  CHECK((state = 'active' AND redirectFeatureId IS NULL)
    OR (state = 'merged' AND redirectFeatureId IS NOT NULL AND redirectFeatureId != featureId AND publishedRevisionId IS NULL)
    OR (state = 'split' AND redirectFeatureId IS NULL AND publishedRevisionId IS NULL))
);
CREATE TABLE featureRevisionProposal (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  baseRevisionId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  contributorId TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','submitted','accepted','rejected','withdrawn')),
  createdChangeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  UNIQUE(featureId,id),
  FOREIGN KEY(featureId,baseRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(featureId,candidateRevisionId) REFERENCES featureRevision(featureId,id),
  CHECK(baseRevisionId != candidateRevisionId)
);
CREATE INDEX feature_proposal_queue ON featureRevisionProposal(status,featureId);
CREATE TABLE featureRevisionReview (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL,
  proposalId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  comparedRevisionId TEXT,
  resultingRevisionId TEXT,
  action TEXT NOT NULL,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  resolutions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(resolutions)),
  FOREIGN KEY(featureId,proposalId) REFERENCES featureRevisionProposal(featureId,id),
  FOREIGN KEY(featureId,candidateRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(featureId,comparedRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(featureId,resultingRevisionId) REFERENCES featureRevision(featureId,id),
  CHECK((action = 'accepted' AND resultingRevisionId IS NOT NULL)
    OR (action IN ('created','saved','submitted','rejected','withdrawn') AND resultingRevisionId IS NULL))
);
CREATE UNIQUE INDEX feature_review_final_decision ON featureRevisionReview(proposalId)
  WHERE action IN ('accepted','rejected','withdrawn');
CREATE TABLE featureRevisionPublication (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  revisionId TEXT,
  generation INTEGER NOT NULL,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  UNIQUE(featureId,generation),
  FOREIGN KEY(featureId,previousRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(featureId,revisionId) REFERENCES featureRevision(featureId,id)
);
CREATE TABLE featureIdentityOperation (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('merge','split')),
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  dispositions TEXT NOT NULL CHECK(json_valid(dispositions))
);
CREATE TABLE featureIdentityOperationMember (
  operationId TEXT NOT NULL REFERENCES featureIdentityOperation(id),
  role TEXT NOT NULL CHECK(role IN ('input','output')),
  featureId TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  UNIQUE(operationId,role,featureId),
  FOREIGN KEY(featureId,revisionId) REFERENCES featureRevision(featureId,id)
);

-- Ordinary parent links must point to already-recorded evidence, preventing deferred
-- cyclic inserts even when foreign-key checking is deferred for a bulk operation.
CREATE TRIGGER feature_revision_existing_parents BEFORE INSERT ON featureRevision BEGIN
  SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM featureRevision WHERE id=NEW.previousRevisionId AND featureId=NEW.featureId
  ) THEN RAISE(ABORT,'feature revision predecessor missing') END;
  SELECT CASE WHEN NEW.mergedFromRevisionId IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM featureRevision WHERE id=NEW.mergedFromRevisionId AND featureId=NEW.featureId
  ) THEN RAISE(ABORT,'feature revision proposal parent missing') END;
END;
CREATE TRIGGER feature_proposal_identity_immutable BEFORE UPDATE ON featureRevisionProposal
WHEN NEW.featureId IS NOT OLD.featureId OR NEW.baseRevisionId IS NOT OLD.baseRevisionId
  OR NEW.contributorId IS NOT OLD.contributorId OR NEW.createdChangeSetId IS NOT OLD.createdChangeSetId
  OR NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT,'proposal identity is immutable'); END;
CREATE TRIGGER feature_proposal_transition BEFORE UPDATE ON featureRevisionProposal
WHEN NOT (
  (OLD.status='draft' AND NEW.status IN ('draft','submitted','withdrawn')) OR
  (OLD.status='submitted' AND NEW.status IN ('accepted','rejected','withdrawn') AND NEW.candidateRevisionId=OLD.candidateRevisionId)
) OR (OLD.status='draft' AND NEW.status!='draft' AND NEW.candidateRevisionId!=OLD.candidateRevisionId)
BEGIN SELECT RAISE(ABORT,'invalid proposal transition'); END;
CREATE TRIGGER feature_head_generation BEFORE UPDATE ON featureRevisionHead
WHEN NEW.generation != OLD.generation + 1 OR NEW.featureId != OLD.featureId
BEGIN SELECT RAISE(ABORT,'invalid feature head generation'); END;
CREATE TRIGGER revisionChangeSet_immutable_update BEFORE UPDATE ON revisionChangeSet
BEGIN SELECT RAISE(ABORT,'revisionChangeSet is immutable'); END;
CREATE TRIGGER revisionChangeSet_immutable_delete BEFORE DELETE ON revisionChangeSet
BEGIN SELECT RAISE(ABORT,'revisionChangeSet is immutable'); END;
CREATE TRIGGER featureRevision_immutable_update BEFORE UPDATE ON featureRevision
BEGIN SELECT RAISE(ABORT,'featureRevision is immutable'); END;
CREATE TRIGGER featureRevision_immutable_delete BEFORE DELETE ON featureRevision
BEGIN SELECT RAISE(ABORT,'featureRevision is immutable'); END;
CREATE TRIGGER featureRevisionReview_immutable_update BEFORE UPDATE ON featureRevisionReview
BEGIN SELECT RAISE(ABORT,'featureRevisionReview is immutable'); END;
CREATE TRIGGER featureRevisionReview_immutable_delete BEFORE DELETE ON featureRevisionReview
BEGIN SELECT RAISE(ABORT,'featureRevisionReview is immutable'); END;
CREATE TRIGGER featureRevisionPublication_immutable_update BEFORE UPDATE ON featureRevisionPublication
BEGIN SELECT RAISE(ABORT,'featureRevisionPublication is immutable'); END;
CREATE TRIGGER featureRevisionPublication_immutable_delete BEFORE DELETE ON featureRevisionPublication
BEGIN SELECT RAISE(ABORT,'featureRevisionPublication is immutable'); END;
CREATE TRIGGER featureIdentityOperation_immutable_update BEFORE UPDATE ON featureIdentityOperation
BEGIN SELECT RAISE(ABORT,'featureIdentityOperation is immutable'); END;
CREATE TRIGGER featureIdentityOperation_immutable_delete BEFORE DELETE ON featureIdentityOperation
BEGIN SELECT RAISE(ABORT,'featureIdentityOperation is immutable'); END;
CREATE TRIGGER featureIdentityOperationMember_immutable_update BEFORE UPDATE ON featureIdentityOperationMember
BEGIN SELECT RAISE(ABORT,'featureIdentityOperationMember is immutable'); END;
CREATE TRIGGER featureIdentityOperationMember_immutable_delete BEFORE DELETE ON featureIdentityOperationMember
BEGIN SELECT RAISE(ABORT,'featureIdentityOperationMember is immutable'); END;
-- Published lineage is sealed by its publication receipt; later insertions would falsify it.
CREATE TRIGGER feature_identity_members_sealed BEFORE INSERT ON featureIdentityOperationMember
WHEN EXISTS (SELECT 1 FROM featureIdentityOperation o JOIN featureRevisionPublication p ON p.changeSetId=o.changeSetId WHERE o.id=NEW.operationId)
BEGIN SELECT RAISE(ABORT,'identity operation is sealed'); END;
CREATE TRIGGER feature_proposal_keep_history BEFORE DELETE ON featureRevisionProposal
BEGIN SELECT RAISE(ABORT,'proposal history must be retained'); END;
CREATE TRIGGER feature_head_keep_history BEFORE DELETE ON featureRevisionHead
BEGIN SELECT RAISE(ABORT,'feature head must be retained'); END;
CREATE TRIGGER feature_retired_publication_guard BEFORE UPDATE OF isPublished ON feature
WHEN NEW.isPublished=1 AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.id AND state!='active')
BEGIN SELECT RAISE(ABORT,'retired feature cannot be republished'); END;
CREATE TRIGGER feature_head_retirement_final BEFORE UPDATE ON featureRevisionHead
WHEN OLD.state!='active' AND (NEW.state IS NOT OLD.state OR NEW.redirectFeatureId IS NOT OLD.redirectFeatureId)
BEGIN SELECT RAISE(ABORT,'retired feature lineage cannot be rewritten'); END;
CREATE TRIGGER feature_head_redirect_target BEFORE UPDATE ON featureRevisionHead
WHEN NEW.state='merged' AND NOT EXISTS (
  SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.redirectFeatureId AND state='active' AND publishedRevisionId IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'merge survivor must be an active published feature'); END;
