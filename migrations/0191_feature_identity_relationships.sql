-- Identity acceptance moves work, never historical visits or completed tasks.
CREATE TABLE featureTaskTransfer (
 id TEXT PRIMARY KEY NOT NULL,
 identityProposalId TEXT NOT NULL REFERENCES featureIdentityProposalDecision(proposalId),
 taskId TEXT NOT NULL REFERENCES task(id),
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 sourceFeatureId TEXT NOT NULL REFERENCES feature(id),
 targetFeatureId TEXT NOT NULL REFERENCES feature(id),
 sourceModifiedAt TEXT NOT NULL,
 changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
 UNIQUE(taskId,sequence),
 CHECK(sourceFeatureId <> targetFeatureId)
);
CREATE TABLE featureTaskUploadTransfer (
 transferId TEXT NOT NULL REFERENCES featureTaskTransfer(id),
 uploadId TEXT NOT NULL REFERENCES featureImageUploadRevision(id),
 sourceProposalId TEXT NOT NULL REFERENCES featureRevisionProposal(id),
 sourceCandidateRevisionId TEXT NOT NULL REFERENCES featureRevision(id),
 proposalId TEXT NOT NULL REFERENCES featureRevisionProposal(id),
 PRIMARY KEY(transferId,uploadId)
);
CREATE INDEX feature_task_transfer_proposal ON featureTaskTransfer(identityProposalId);
CREATE INDEX feature_task_upload_transfer_proposal ON featureTaskUploadTransfer(proposalId);
CREATE TRIGGER feature_task_transfer_owner BEFORE INSERT ON featureTaskTransfer
WHEN NOT EXISTS(SELECT 1 FROM task t
 JOIN featureIdentityProposalDecision d ON d.proposalId=NEW.identityProposalId AND d.outcome='accepted'
 JOIN featureIdentityOperationMember source ON source.operationId=d.operationId AND source.role='input' AND source.featureId=NEW.sourceFeatureId
 JOIN featureIdentityOperationMember target ON target.operationId=d.operationId AND target.role='output' AND target.featureId=NEW.targetFeatureId
 JOIN feature sourceFeature ON sourceFeature.id=NEW.sourceFeatureId AND sourceFeature.organisationId=t.organisationId AND sourceFeature.projectId=t.projectId
 JOIN feature targetFeature ON targetFeature.id=NEW.targetFeatureId AND targetFeature.organisationId=t.organisationId AND targetFeature.projectId=t.projectId
 WHERE t.id=NEW.taskId AND t.featureId=NEW.sourceFeatureId AND t.isReviewed=0 AND t.modifiedAt=NEW.sourceModifiedAt
 AND NEW.sequence=COALESCE((SELECT max(sequence) FROM featureTaskTransfer WHERE taskId=t.id),0)+1)
BEGIN SELECT RAISE(ABORT,'Task transfer requires an accepted identity operation and unchanged open task'); END;
CREATE TRIGGER feature_task_transfer_no_update BEFORE UPDATE ON featureTaskTransfer BEGIN SELECT RAISE(ABORT,'Task transfer receipts are immutable'); END;
CREATE TRIGGER feature_task_transfer_no_delete BEFORE DELETE ON featureTaskTransfer BEGIN SELECT RAISE(ABORT,'Task transfer receipts are immutable'); END;
CREATE TRIGGER feature_task_upload_transfer_no_update BEFORE UPDATE ON featureTaskUploadTransfer BEGIN SELECT RAISE(ABORT,'Transferred upload evidence is immutable'); END;
CREATE TRIGGER feature_task_upload_transfer_no_delete BEFORE DELETE ON featureTaskUploadTransfer BEGIN SELECT RAISE(ABORT,'Transferred upload evidence is immutable'); END;

-- Resolve the latest assignment without rewriting any original upload receipt.
-- New uploads after a move remain ordinary receipts until a subsequent move.
CREATE VIEW featureTaskUploadEvidence AS
SELECT u.id,t.featureId,u.proposalId,u.candidateRevisionId,u.imageId,u.imageRevisionId,u.assetVersionId,u.actorId,
 json_array(t.id) taskIds
FROM featureImageUploadRevision u JOIN json_each(u.taskIds) j JOIN task t ON t.id=j.value AND t.featureId=u.featureId
WHERE NOT EXISTS(SELECT 1 FROM featureTaskTransfer move JOIN featureTaskUploadTransfer pin ON pin.transferId=move.id AND pin.uploadId=u.id
 WHERE move.taskId=t.id AND move.sequence=(SELECT max(sequence) FROM featureTaskTransfer WHERE taskId=t.id))
UNION ALL
SELECT u.id,t.featureId,p.id,p.candidateRevisionId,u.imageId,u.imageRevisionId,u.assetVersionId,u.actorId,json_array(t.id)
FROM featureTaskTransfer move JOIN task t ON t.id=move.taskId AND t.featureId=move.targetFeatureId
JOIN featureTaskUploadTransfer pin ON pin.transferId=move.id
JOIN featureImageUploadRevision u ON u.id=pin.uploadId
JOIN featureRevisionProposal p ON p.id=pin.proposalId
WHERE move.sequence=(SELECT max(sequence) FROM featureTaskTransfer WHERE taskId=t.id)
UNION ALL
SELECT * FROM featureImageUploadRevision WHERE json_array_length(taskIds)=0;

-- A forwarded pin must come from this task's original upload and exact previous proposal.
CREATE TRIGGER feature_task_upload_transfer_owner BEFORE INSERT ON featureTaskUploadTransfer
WHEN NOT EXISTS(SELECT 1 FROM featureTaskTransfer move
 JOIN featureImageUploadRevision u ON u.id=NEW.uploadId
 JOIN featureRevisionProposal source ON source.id=NEW.sourceProposalId AND source.candidateRevisionId=NEW.sourceCandidateRevisionId
 JOIN featureRevisionProposal target ON target.id=NEW.proposalId
 WHERE move.id=NEW.transferId AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=move.taskId)
 AND (source.id=u.proposalId OR EXISTS(SELECT 1 FROM featureTaskUploadTransfer prior
   JOIN featureTaskTransfer previous ON previous.id=prior.transferId AND previous.taskId=move.taskId AND previous.sequence<move.sequence
   WHERE prior.uploadId=u.id AND prior.proposalId=source.id))
 AND ((source.status IN('accepted','rejected','withdrawn') AND target.id=source.id)
   OR (source.status IN('draft','submitted') AND target.featureId=move.targetFeatureId AND target.contributorId=u.actorId
     AND EXISTS(SELECT 1 FROM featureRevisionImage pin WHERE pin.featureRevisionId=target.candidateRevisionId
       AND pin.imageId=u.imageId AND pin.imageRevisionId=u.imageRevisionId))))
BEGIN SELECT RAISE(ABORT,'Forwarded photo must retain the original task upload and exact proposal ancestry'); END;

CREATE TRIGGER feature_task_assignment_requires_receipt BEFORE UPDATE OF featureId ON task
WHEN NEW.featureId<>OLD.featureId AND (EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=OLD.featureId)
 OR EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.featureId))
 AND NOT EXISTS(SELECT 1 FROM featureTaskTransfer move WHERE move.taskId=OLD.id AND move.sourceFeatureId=OLD.featureId
  AND move.targetFeatureId=NEW.featureId AND move.sourceModifiedAt=OLD.modifiedAt AND OLD.isReviewed=0
  AND move.sequence=(SELECT max(sequence) FROM featureTaskTransfer WHERE taskId=OLD.id))
BEGIN SELECT RAISE(ABORT,'Assign enrolled tasks through reviewed identity operations'); END;
