-- Target schema for migration rehearsal; this is NOT a live upgrade script.
-- Current content tables and image tables remain normal application tables.
ALTER TABLE feature ADD COLUMN currentRevisionId TEXT REFERENCES featureRevision(id);
ALTER TABLE feature ADD COLUMN revisionVersion INTEGER NOT NULL DEFAULT 0 CHECK(revisionVersion>=0);
CREATE TABLE revisionChangeSet (
 id TEXT PRIMARY KEY NOT NULL,actorId TEXT NOT NULL CHECK(length(trim(actorId))>0),
 origin TEXT NOT NULL CHECK(origin IN ('user','system','import','migration','restore')),
 reason TEXT,createdAt TEXT NOT NULL,legacyEvidence TEXT CHECK(legacyEvidence IS NULL OR json_valid(legacyEvidence))
);
CREATE TABLE featureRevision (
 id TEXT PRIMARY KEY NOT NULL,featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
 previousRevisionId TEXT,mergedFromRevisionId TEXT,changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
 schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion=1),content TEXT NOT NULL CHECK(json_valid(content)),
 recordState TEXT CHECK(recordState IS NULL OR json_valid(recordState)),sequence INTEGER CHECK(sequence IS NULL OR sequence>=0),
 legacyEvidence TEXT CHECK(legacyEvidence IS NULL OR json_valid(legacyEvidence)),
 baselineAttribution TEXT CHECK(baselineAttribution IS NULL OR json_valid(baselineAttribution)),
 UNIQUE(featureId,id),UNIQUE(featureId,sequence),
 FOREIGN KEY(featureId,previousRevisionId) REFERENCES featureRevision(featureId,id),
 FOREIGN KEY(featureId,mergedFromRevisionId) REFERENCES featureRevision(featureId,id),
 CHECK(previousRevisionId IS NOT id AND mergedFromRevisionId IS NOT id)
);
CREATE TABLE featureRevisionProposal (
 id TEXT PRIMARY KEY NOT NULL,featureId TEXT REFERENCES feature(id) ON DELETE RESTRICT,
 baseRevisionId TEXT REFERENCES featureRevision(id),kind TEXT NOT NULL CHECK(kind IN ('update','create','split','merge')),
 version TEXT NOT NULL,changes TEXT NOT NULL CHECK(json_valid(changes)),
 creationScope TEXT CHECK(creationScope IS NULL OR json_valid(creationScope)),
 contributorId TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','submitted','accepted','rejected','withdrawn')),
 createdChangeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
 FOREIGN KEY(featureId,baseRevisionId) REFERENCES featureRevision(featureId,id),
 CHECK((kind='create' AND featureId IS NULL AND baseRevisionId IS NULL AND creationScope IS NOT NULL) OR (kind!='create' AND featureId IS NOT NULL)),
 CHECK(kind!='update' OR baseRevisionId IS NOT NULL)
);
CREATE INDEX feature_proposal_queue ON featureRevisionProposal(status,featureId);
CREATE TABLE featureRevisionReview (
 id TEXT PRIMARY KEY NOT NULL,featureId TEXT REFERENCES feature(id),proposalId TEXT NOT NULL REFERENCES featureRevisionProposal(id),
 proposalVersion TEXT NOT NULL,changes TEXT NOT NULL CHECK(json_valid(changes)),
 comparedRevisionId TEXT REFERENCES featureRevision(id),resultingRevisionId TEXT REFERENCES featureRevision(id),
 action TEXT NOT NULL CHECK(action IN ('created','saved','submitted','accepted','rejected','withdrawn','retargeted')),
 context TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(context)),
 changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),resolutions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(resolutions)),
 CHECK((action='accepted' AND resultingRevisionId IS NOT NULL) OR (action!='accepted' AND resultingRevisionId IS NULL))
);
CREATE UNIQUE INDEX feature_review_final_decision ON featureRevisionReview(proposalId) WHERE action IN ('accepted','rejected','withdrawn');
CREATE TABLE featureIdentityOperation (
 id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('merge','split')),
 changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),dispositions TEXT NOT NULL CHECK(json_valid(dispositions))
);
CREATE TABLE featureIdentityOperationMember (
 operationId TEXT NOT NULL REFERENCES featureIdentityOperation(id),role TEXT NOT NULL CHECK(role IN ('input','output')),
 featureId TEXT NOT NULL,revisionId TEXT NOT NULL,UNIQUE(operationId,role,featureId),
 FOREIGN KEY(featureId,revisionId) REFERENCES featureRevision(featureId,id)
);
CREATE TABLE featureRevisionWriteScope(featureId TEXT PRIMARY KEY REFERENCES feature(id),token TEXT NOT NULL);
CREATE TABLE featureUploadEvidence (
 id TEXT PRIMARY KEY NOT NULL,featureId TEXT REFERENCES feature(id),proposalId TEXT NOT NULL REFERENCES featureRevisionProposal(id),
 proposalVersion TEXT NOT NULL,imageId TEXT NOT NULL,imageRevisionId TEXT NOT NULL,
 assetVersionId TEXT NOT NULL UNIQUE,actorId TEXT NOT NULL,taskIds TEXT NOT NULL CHECK(json_valid(taskIds)),
 FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id),
 FOREIGN KEY(imageId,assetVersionId) REFERENCES imageAssetVersion(imageId,id)
);
CREATE TRIGGER feature_revision_no_update BEFORE UPDATE ON featureRevision BEGIN SELECT RAISE(ABORT,'Feature history is immutable'); END;
CREATE TRIGGER feature_revision_no_delete BEFORE DELETE ON featureRevision BEGIN SELECT RAISE(ABORT,'Feature history must be retained'); END;
CREATE TRIGGER feature_review_no_update BEFORE UPDATE ON featureRevisionReview BEGIN SELECT RAISE(ABORT,'Review evidence is immutable'); END;
CREATE TRIGGER feature_review_no_delete BEFORE DELETE ON featureRevisionReview BEGIN SELECT RAISE(ABORT,'Review evidence must be retained'); END;
CREATE TRIGGER feature_identity_no_update BEFORE UPDATE ON featureIdentityOperation BEGIN SELECT RAISE(ABORT,'Identity history is immutable'); END;
CREATE TRIGGER feature_identity_no_delete BEFORE DELETE ON featureIdentityOperation BEGIN SELECT RAISE(ABORT,'Identity history must be retained'); END;
CREATE TRIGGER feature_identity_member_no_update BEFORE UPDATE ON featureIdentityOperationMember BEGIN SELECT RAISE(ABORT,'Identity history is immutable'); END;
CREATE TRIGGER feature_identity_member_no_delete BEFORE DELETE ON featureIdentityOperationMember BEGIN SELECT RAISE(ABORT,'Identity history must be retained'); END;
CREATE TRIGGER feature_current_revision_owner BEFORE UPDATE OF currentRevisionId,revisionVersion ON feature
WHEN NEW.currentRevisionId IS NOT OLD.currentRevisionId OR NEW.revisionVersion IS NOT OLD.revisionVersion
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM featureRevision r WHERE r.id=NEW.currentRevisionId AND r.featureId=NEW.id
   AND r.sequence=NEW.revisionVersion AND json_extract(r.recordState,'$.isPublished')=NEW.isPublished
   AND json_extract(r.recordState,'$.isArchived')=NEW.isArchived)
  THEN RAISE(ABORT,'Current Feature revision must match its accepted record') END;
 SELECT CASE WHEN (OLD.currentRevisionId IS NOT NULL AND NEW.revisionVersion!=OLD.revisionVersion+1)
   OR (OLD.currentRevisionId IS NULL AND NEW.revisionVersion!=0)
  THEN RAISE(ABORT,'Feature revision version must advance once') END;
END;
CREATE TRIGGER feature_proposal_frozen BEFORE UPDATE ON featureRevisionProposal
WHEN OLD.status!='draft' AND (NEW.changes IS NOT OLD.changes OR NEW.version IS NOT OLD.version
 OR NEW.featureId IS NOT OLD.featureId OR NEW.baseRevisionId IS NOT OLD.baseRevisionId OR NEW.kind IS NOT OLD.kind OR NEW.creationScope IS NOT OLD.creationScope)
BEGIN SELECT RAISE(ABORT,'Submitted proposal evidence is frozen'); END;
CREATE TRIGGER feature_proposal_terminal BEFORE UPDATE ON featureRevisionProposal
WHEN OLD.status IN ('accepted','rejected','withdrawn')
BEGIN SELECT RAISE(ABORT,'Reviewed proposals are immutable'); END;
CREATE TRIGGER feature_proposal_state BEFORE UPDATE OF status ON featureRevisionProposal
WHEN NOT ((OLD.status='draft' AND NEW.status IN ('draft','submitted','withdrawn')) OR (OLD.status='submitted' AND NEW.status IN ('accepted','rejected','withdrawn')))
BEGIN SELECT RAISE(ABORT,'Invalid proposal transition'); END;
CREATE TRIGGER feature_proposal_keep_history BEFORE DELETE ON featureRevisionProposal BEGIN SELECT RAISE(ABORT,'Proposal evidence must be retained'); END;

-- Accepted content and visibility must move through the same attributed writer.
CREATE TRIGGER feature_revision_projection_update BEFORE UPDATE ON feature
WHEN (NEW.isPublished IS NOT OLD.isPublished OR NEW.localIsPublished IS NOT OLD.localIsPublished OR NEW.isArchived IS NOT OLD.isArchived OR NEW.organisationId IS NOT OLD.organisationId OR NEW.projectId IS NOT OLD.projectId OR NEW.layerId IS NOT OLD.layerId OR NEW.geometry IS NOT OLD.geometry OR NEW.addressMeta IS NOT OLD.addressMeta OR NEW.isIntangible IS NOT OLD.isIntangible OR NEW.isVisitable IS NOT OLD.isVisitable OR NEW.visitableAsOf IS NOT OLD.visitableAsOf OR NEW.localLocationBrands IS NOT OLD.localLocationBrands) AND EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.id)
BEGIN SELECT RAISE(ABORT,'Feature content requires an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureI18n_insert BEFORE INSERT ON featureI18n
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
-- Refs #194: derived title refreshes retain attribution guards for all authored fields.
CREATE TRIGGER feature_revision_guard_featureI18n_update BEFORE UPDATE ON featureI18n
WHEN (NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale
 OR NEW.baseName IS NOT OLD.baseName OR NEW.nameOverride IS NOT OLD.nameOverride
 OR NEW.titleGen IS NOT OLD.titleGen OR NEW.description IS NOT OLD.description
 OR NEW.descriptionGen IS NOT OLD.descriptionGen OR NEW.displayAddress IS NOT OLD.displayAddress
 OR NEW.displayAddressGen IS NOT OLD.displayAddressGen OR NEW.addressProperties IS NOT OLD.addressProperties
 OR NEW.isAutomaticOnly IS NOT OLD.isAutomaticOnly OR NEW.autoTranslated IS NOT OLD.autoTranslated
 OR NEW.translationProvenance IS NOT OLD.translationProvenance
 OR NEW.title IS NOT (SELECT title FROM featureComputedName WHERE featureId=OLD.featureId AND locale=OLD.locale)) AND (
 (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
 OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId)))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureI18n_delete BEFORE DELETE ON featureI18n
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_insert BEFORE INSERT ON featureProperty
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_update BEFORE UPDATE ON featureProperty
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureProperty_delete BEFORE DELETE ON featureProperty
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_insert BEFORE INSERT ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_update BEFORE UPDATE ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featurePropertyI18n_delete BEFORE DELETE ON featurePropertyI18n
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_insert BEFORE INSERT ON featureImage
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_update BEFORE UPDATE ON featureImage
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureImage_delete BEFORE DELETE ON featureImage
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_insert BEFORE INSERT ON featureLocation
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_update BEFORE UPDATE ON featureLocation
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocation_delete BEFORE DELETE ON featureLocation
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_insert BEFORE INSERT ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_update BEFORE UPDATE ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId)) OR (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=NEW.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;
CREATE TRIGGER feature_revision_guard_featureLocationMembership_delete BEFORE DELETE ON featureLocationMembership
WHEN (EXISTS(SELECT 1 FROM feature WHERE currentRevisionId IS NOT NULL AND id=OLD.featureId) AND NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=OLD.featureId))
BEGIN SELECT RAISE(ABORT,'Feature relations require an attributed revision transaction'); END;

CREATE TRIGGER feature_revision_chain BEFORE INSERT ON featureRevision
WHEN NEW.sequence IS NOT NULL AND NEW.sequence>0
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM feature f WHERE f.id=NEW.featureId
  AND f.currentRevisionId=NEW.previousRevisionId AND f.revisionVersion+1=NEW.sequence)
 THEN RAISE(ABORT,'Accepted revisions must extend the current record') END;
END;
CREATE TRIGGER feature_revision_scope_close BEFORE DELETE ON featureRevisionWriteScope
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId
  WHERE f.id=OLD.featureId AND r.featureId=f.id AND r.sequence=f.revisionVersion
  AND json_extract(r.recordState,'$.isPublished')=f.isPublished
  AND json_extract(r.recordState,'$.isArchived')=f.isArchived
  AND json_extract(r.recordState,'$.localIsPublished') IS f.localIsPublished
  AND json_extract(r.recordState,'$.organisationId')=f.organisationId
  AND json_extract(r.recordState,'$.projectId')=f.projectId AND json_extract(r.recordState,'$.layerId')=f.layerId)
 THEN RAISE(ABORT,'Accepted revision must record final visibility and scope') END;
END;

CREATE TRIGGER feature_upload_evidence_no_update BEFORE UPDATE ON featureUploadEvidence
BEGIN SELECT RAISE(ABORT,'Upload evidence is immutable'); END;
CREATE TRIGGER feature_upload_evidence_no_delete BEFORE DELETE ON featureUploadEvidence
BEGIN SELECT RAISE(ABORT,'Upload evidence must be retained'); END;
