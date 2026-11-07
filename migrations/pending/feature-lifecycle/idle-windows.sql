-- Install after the lifecycle target and image schema. Cutover itself seals every legacy Feature window.
CREATE TABLE IF NOT EXISTS revisionEditWindow(resource TEXT NOT NULL,revisionId TEXT NOT NULL,actorId TEXT NOT NULL,origin TEXT NOT NULL,lastEditedAt INTEGER NOT NULL,closedAt INTEGER,PRIMARY KEY(resource,revisionId));
CREATE TABLE IF NOT EXISTS revisionEditSelection(token TEXT PRIMARY KEY,revisionId TEXT NOT NULL);
UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource IN ('feature','featureDraft');
DROP TRIGGER feature_revision_no_update;
CREATE TRIGGER feature_revision_no_update BEFORE UPDATE ON featureRevision
WHEN NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.previousRevisionId IS NOT OLD.previousRevisionId
 OR NEW.mergedFromRevisionId IS NOT OLD.mergedFromRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
 OR NEW.schemaVersion IS NOT OLD.schemaVersion OR NEW.legacyEvidence IS NOT OLD.legacyEvidence
 OR NEW.baselineAttribution IS NOT OLD.baselineAttribution OR NEW.recordState IS NOT OLD.recordState
 OR NEW.sequence!=OLD.sequence+1
 OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
   JOIN feature f ON f.currentRevisionId=e.revisionId AND f.revisionVersion=OLD.sequence
   JOIN featureRevisionWriteScope w ON w.featureId=f.id
   WHERE e.resource='feature' AND e.revisionId=OLD.id AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
 OR EXISTS(SELECT 1 FROM featureRevision r WHERE r.previousRevisionId=OLD.id OR r.mergedFromRevisionId=OLD.id)
 OR EXISTS(SELECT 1 FROM featureRevisionProposal p WHERE p.baseRevisionId=OLD.id)
 OR EXISTS(SELECT 1 FROM featureRevisionReview r WHERE r.comparedRevisionId=OLD.id OR r.resultingRevisionId=OLD.id)
 OR EXISTS(SELECT 1 FROM featureIdentityOperationMember m WHERE m.revisionId=OLD.id)
BEGIN SELECT RAISE(ABORT,'Feature history is immutable'); END;
CREATE TRIGGER feature_idle_proposal_base AFTER INSERT ON featureRevisionProposal
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId=NEW.baseRevisionId; END;
CREATE TRIGGER feature_idle_review_boundary AFTER INSERT ON featureRevisionReview
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId IN (NEW.comparedRevisionId,NEW.resultingRevisionId); END;

CREATE TRIGGER feature_revision_gallery_update BEFORE UPDATE OF content ON featureRevision
WHEN json_type(NEW.content,'$.gallery') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_type(NEW.content,'$.gallery') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.entries') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.order') IS NOT 'array'
    OR json_array_length(NEW.content,'$.gallery.order') != (SELECT count(*) FROM json_each(NEW.content,'$.gallery.entries'))
    OR EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.order') o
      WHERE o.type!='text' OR NOT EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.entries') e WHERE e.key=o.value))
  THEN RAISE(ABORT,'invalid revision gallery') END;
END;

DROP TRIGGER featureRevisionImage_immutable_delete;
CREATE TRIGGER featureRevisionImage_immutable_delete BEFORE DELETE ON featureRevisionImage
WHEN NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
 JOIN featureRevision r ON r.id=e.revisionId JOIN featureRevisionWriteScope w ON w.featureId=r.featureId
 WHERE e.resource='feature' AND e.revisionId=OLD.featureRevisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'featureRevisionImage is immutable'); END;
CREATE TRIGGER feature_revision_gallery_refresh AFTER UPDATE OF content ON featureRevision
BEGIN
 DELETE FROM featureRevisionImage WHERE featureRevisionId=NEW.id;
 INSERT INTO featureRevisionImage(featureRevisionId,imageId,imageRevisionId,position,intent)
 SELECT NEW.id,e.key,json_extract(e.value,'$.imageRevisionId'),CAST(o.key AS INTEGER),json_extract(e.value,'$.intent')
 FROM json_each(NEW.content,'$.gallery.entries') e JOIN json_each(NEW.content,'$.gallery.order') o ON o.value=e.key;
END;

DROP TRIGGER feature_review_no_update;
CREATE TRIGGER feature_review_no_update BEFORE UPDATE ON featureRevisionReview
WHEN OLD.action!='saved' OR NEW.action IS NOT OLD.action OR NEW.id IS NOT OLD.id
 OR NEW.featureId IS NOT OLD.featureId OR NEW.proposalId IS NOT OLD.proposalId
 OR NEW.changeSetId IS NOT OLD.changeSetId OR NEW.comparedRevisionId IS NOT OLD.comparedRevisionId
 OR NEW.resultingRevisionId IS NOT OLD.resultingRevisionId OR NEW.context IS NOT OLD.context OR NEW.resolutions IS NOT OLD.resolutions
 OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
 JOIN featureRevisionProposal p ON p.id=OLD.proposalId AND p.status='draft' AND p.version=NEW.proposalVersion
 JOIN revisionChangeSet c ON c.id=OLD.changeSetId AND c.actorId=p.contributorId AND c.origin='user'
 WHERE e.resource='featureDraft' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user'
 AND e.closedAt IS NULL AND e.lastEditedAt <= (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 AND e.closedAt IS NULL AND e.lastEditedAt > (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Review evidence is immutable'); END;
CREATE TRIGGER feature_draft_idle_boundary AFTER UPDATE OF status ON featureRevisionProposal
WHEN NEW.status!='draft'
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='featureDraft'
 AND revisionId IN (SELECT id FROM featureRevisionReview WHERE proposalId=NEW.id); END;

-- Upload receipts pin the proposal version that established exact media evidence.
CREATE TRIGGER feature_draft_idle_upload_boundary AFTER INSERT ON featureUploadEvidence
BEGIN UPDATE revisionEditWindow
 SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 WHERE resource='featureDraft' AND revisionId IN (SELECT id FROM featureRevisionReview
   WHERE proposalId=NEW.proposalId AND proposalVersion=NEW.proposalVersion); END;
CREATE TRIGGER feature_idle_identity_proposal_boundary AFTER INSERT ON featureRevisionProposal
WHEN NEW.kind IN ('merge','split')
BEGIN UPDATE revisionEditWindow
 SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 WHERE resource='feature' AND revisionId IN (SELECT value FROM json_tree(NEW.changes) WHERE key='revisionId'); END;
