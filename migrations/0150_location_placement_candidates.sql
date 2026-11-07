-- Refs #194. Extend existing adoption evidence with exact placement and Layer fences.
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
  occupancyRevisionId TEXT REFERENCES locationOccupancy(id),
  addressRevisionId TEXT REFERENCES addressRevision(id),
  layerId TEXT,
  layerPolicyRevision INTEGER CHECK(layerPolicyRevision IS NULL OR layerPolicyRevision>=0)
);
INSERT INTO _next_locationAdoptionProposal(id,featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence,factsDecision,locationDecision,organisationRevision,createdAt) SELECT id,featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence,factsDecision,locationDecision,organisationRevision,createdAt FROM locationAdoptionProposal;
DROP TABLE locationAdoptionProposal;
ALTER TABLE _next_locationAdoptionProposal RENAME TO locationAdoptionProposal;
CREATE INDEX location_adoption_project ON locationAdoptionProposal(projectId,featureId);
CREATE UNIQUE INDEX location_adoption_candidate ON locationAdoptionProposal(featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,organisationRevision,COALESCE(occupancyRevisionId,''),COALESCE(addressRevisionId,''),COALESCE(layerId,''),COALESCE(layerPolicyRevision,-1));
CREATE TRIGGER location_adoption_proposal_no_delete BEFORE DELETE ON locationAdoptionProposal BEGIN SELECT RAISE(ABORT,'Location adoption evidence is immutable'); END;
CREATE TRIGGER location_adoption_proposal_no_update BEFORE UPDATE ON locationAdoptionProposal
WHEN NEW.occupancyRevisionId IS NOT OLD.occupancyRevisionId OR NEW.addressRevisionId IS NOT OLD.addressRevisionId OR NEW.layerId IS NOT OLD.layerId OR NEW.layerPolicyRevision IS NOT OLD.layerPolicyRevision OR NEW.organisationRevision IS NOT OLD.organisationRevision OR NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.locationId IS NOT OLD.locationId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Location adoption evidence and decisions are immutable'); END;
