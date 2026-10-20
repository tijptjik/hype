-- Keep immutable assessment evidence and its two decisions together. Refs #194.
-- spec/breadline/proposal/01-places-features.md
DROP TRIGGER place_adoption_proposal_no_update;
ALTER TABLE placeAdoptionProposal ADD COLUMN factsDecision TEXT
  CHECK (factsDecision IS NULL OR (json_valid(factsDecision) AND json_type(factsDecision)='object'
    AND json_extract(factsDecision,'$.proposalId') IS id
    AND json_extract(factsDecision,'$.fieldGroup') IS 'facts'
    AND COALESCE(json_extract(factsDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(factsDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(factsDecision,'$.id') IS 'text' AND json_type(factsDecision,'$.actorId') IS 'text'
    AND json_type(factsDecision,'$.associationRevision') IS 'text' AND json_type(factsDecision,'$.createdAt') IS 'text'));
UPDATE placeAdoptionProposal SET factsDecision=(SELECT json_object(
  'id',d.id,'proposalId',d.proposalId,'fieldGroup',d.fieldGroup,'action',d.action,
  'actorId',d.actorId,'reason',d.reason,'associationRevision',d.associationRevision,'createdAt',d.createdAt)
  FROM placeAdoptionDecision d WHERE d.proposalId=placeAdoptionProposal.id AND d.fieldGroup='facts');
ALTER TABLE placeAdoptionProposal ADD COLUMN locationDecision TEXT
  CHECK (locationDecision IS NULL OR (json_valid(locationDecision) AND json_type(locationDecision)='object'
    AND json_extract(locationDecision,'$.proposalId') IS id
    AND json_extract(locationDecision,'$.fieldGroup') IS 'location'
    AND COALESCE(json_extract(locationDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(locationDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(locationDecision,'$.id') IS 'text' AND json_type(locationDecision,'$.actorId') IS 'text'
    AND json_type(locationDecision,'$.associationRevision') IS 'text' AND json_type(locationDecision,'$.createdAt') IS 'text'));
UPDATE placeAdoptionProposal SET locationDecision=(SELECT json_object(
  'id',d.id,'proposalId',d.proposalId,'fieldGroup',d.fieldGroup,'action',d.action,
  'actorId',d.actorId,'reason',d.reason,'associationRevision',d.associationRevision,'createdAt',d.createdAt)
  FROM placeAdoptionDecision d WHERE d.proposalId=placeAdoptionProposal.id AND d.fieldGroup='location');
CREATE TRIGGER place_adoption_proposal_no_update BEFORE UPDATE ON placeAdoptionProposal
WHEN NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.placeId IS NOT OLD.placeId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Place adoption evidence and decisions are immutable'); END;
DROP TABLE placeAdoptionDecision;
