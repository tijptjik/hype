-- Finalization receipts grant attachment only to the Feature/proposal reviewed by staff.
-- No featureImage membership is created until publication. Task evidence remains linked.
CREATE TABLE featureImageUploadRevision (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL,
  proposalId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  imageId TEXT NOT NULL,
  imageRevisionId TEXT NOT NULL,
  assetVersionId TEXT NOT NULL UNIQUE,
  actorId TEXT NOT NULL,
  taskIds TEXT NOT NULL CHECK(json_valid(taskIds) AND json_type(taskIds)='array'),
  FOREIGN KEY(featureId,proposalId) REFERENCES featureRevisionProposal(featureId,id),
  FOREIGN KEY(featureId,candidateRevisionId) REFERENCES featureRevision(featureId,id),
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id),
  FOREIGN KEY(imageId,assetVersionId) REFERENCES imageAssetVersion(imageId,id)
);
CREATE INDEX feature_image_upload_proposal ON featureImageUploadRevision(featureId,proposalId);
CREATE TRIGGER feature_image_upload_exact BEFORE INSERT ON featureImageUploadRevision
WHEN NOT EXISTS (SELECT 1 FROM featureRevisionProposal p
  JOIN featureRevisionImage pin ON pin.featureRevisionId=p.candidateRevisionId
  JOIN imageRevision ir ON ir.id=pin.imageRevisionId AND ir.imageId=pin.imageId
  WHERE p.id=NEW.proposalId AND p.featureId=NEW.featureId
    AND p.candidateRevisionId=NEW.candidateRevisionId AND p.contributorId=NEW.actorId
    AND pin.imageId=NEW.imageId AND pin.imageRevisionId=NEW.imageRevisionId
    AND ir.assetVersionId=NEW.assetVersionId)
BEGIN SELECT RAISE(ABORT,'upload receipt differs from proposal'); END;
CREATE TRIGGER featureImageUploadRevision_immutable_update BEFORE UPDATE ON featureImageUploadRevision
BEGIN SELECT RAISE(ABORT,'featureImageUploadRevision is immutable'); END;
CREATE TRIGGER featureImageUploadRevision_immutable_delete BEFORE DELETE ON featureImageUploadRevision
BEGIN SELECT RAISE(ABORT,'featureImageUploadRevision is immutable'); END;
