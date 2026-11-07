-- Reviewed multi-Feature changes retain their exact inputs, output candidates and relationship decisions.
CREATE TABLE featureIdentityProposal (
 id TEXT PRIMARY KEY NOT NULL,
 actorId TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('merge','split')),
 plan TEXT NOT NULL CHECK(json_valid(plan)),
 changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id)
);
CREATE TABLE featureIdentityProposalDecision (
 proposalId TEXT PRIMARY KEY NOT NULL REFERENCES featureIdentityProposal(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','rejected')),
 operationId TEXT REFERENCES featureIdentityOperation(id),
 changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
 CHECK((outcome='accepted' AND operationId IS NOT NULL) OR (outcome='rejected' AND operationId IS NULL))
);
CREATE TABLE featureIdentityReservation (
 featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id),
 proposalId TEXT NOT NULL REFERENCES featureIdentityProposal(id)
);
CREATE TRIGGER feature_identity_proposal_no_update BEFORE UPDATE ON featureIdentityProposal BEGIN SELECT RAISE(ABORT,'Identity proposals are immutable'); END;
CREATE TRIGGER feature_identity_proposal_no_delete BEFORE DELETE ON featureIdentityProposal BEGIN SELECT RAISE(ABORT,'Identity proposals are immutable'); END;
CREATE TRIGGER feature_identity_decision_no_update BEFORE UPDATE ON featureIdentityProposalDecision BEGIN SELECT RAISE(ABORT,'Identity decisions are immutable'); END;
CREATE TRIGGER feature_identity_decision_no_delete BEFORE DELETE ON featureIdentityProposalDecision BEGIN SELECT RAISE(ABORT,'Identity decisions are immutable'); END;
CREATE TRIGGER feature_identity_reservation_no_update BEFORE UPDATE ON featureIdentityReservation BEGIN SELECT RAISE(ABORT,'Identity reservations are immutable'); END;
CREATE TRIGGER feature_identity_reservation_no_delete BEFORE DELETE ON featureIdentityReservation BEGIN SELECT RAISE(ABORT,'Identity reservations are immutable'); END;
-- A reserved child can only first publish as an output of its reviewed operation.
CREATE TRIGGER feature_identity_reserved_publication BEFORE UPDATE OF publishedRevisionId ON featureRevisionHead
WHEN OLD.generation=0 AND OLD.publishedRevisionId IS NULL AND NEW.publishedRevisionId IS NOT NULL
 AND EXISTS(SELECT 1 FROM featureIdentityReservation WHERE featureId=OLD.featureId)
 AND NOT EXISTS(SELECT 1 FROM featureIdentityReservation reserved
   JOIN featureIdentityProposalDecision d ON d.proposalId=reserved.proposalId AND d.outcome='accepted'
   JOIN featureIdentityOperationMember m ON m.operationId=d.operationId AND m.role='output'
   WHERE reserved.featureId=OLD.featureId AND m.featureId=OLD.featureId AND m.revisionId=NEW.publishedRevisionId)
BEGIN SELECT RAISE(ABORT,'Publish reserved children through their identity proposal'); END;
CREATE TRIGGER feature_identity_decision_owner BEFORE INSERT ON featureIdentityProposalDecision
WHEN NEW.outcome='accepted' AND NOT EXISTS(
 SELECT 1 FROM featureIdentityProposal p JOIN featureIdentityOperation o ON o.id=NEW.operationId AND o.kind=p.kind
 WHERE p.id=NEW.proposalId
 AND NOT EXISTS(SELECT 'input' role,json_extract(value,'$.featureId') featureId,json_extract(value,'$.revisionId') revisionId FROM json_each(p.plan,'$.inputs')
   UNION ALL SELECT 'output',json_extract(value,'$.featureId'),json_extract(value,'$.revisionId') FROM json_each(p.plan,'$.outputs')
   EXCEPT SELECT role,featureId,revisionId FROM featureIdentityOperationMember WHERE operationId=o.id)
 AND NOT EXISTS(SELECT role,featureId,revisionId FROM featureIdentityOperationMember WHERE operationId=o.id
   EXCEPT SELECT 'input',json_extract(value,'$.featureId'),json_extract(value,'$.revisionId') FROM json_each(p.plan,'$.inputs')
   EXCEPT SELECT 'output',json_extract(value,'$.featureId'),json_extract(value,'$.revisionId') FROM json_each(p.plan,'$.outputs')))
BEGIN SELECT RAISE(ABORT,'Identity decision does not match its reviewed outputs'); END;
