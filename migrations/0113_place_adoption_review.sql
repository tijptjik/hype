-- Durable per-Project source-update evidence and independent group decisions. Refs #194.
-- spec/breadline/proposal/01-places-features.md
-- Audit rows deliberately survive Feature deletion and never contain cascading FKs.
CREATE TABLE placeAdoptionProposal (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  placeId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  associationRevision TEXT NOT NULL,
  featureModifiedAt TEXT NOT NULL,
  policyRevision INTEGER NOT NULL CHECK(policyRevision >= 0),
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(featureId, projectId, placeId, candidateRevisionId, associationRevision, featureModifiedAt, policyRevision)
);
CREATE INDEX place_adoption_project ON placeAdoptionProposal(projectId, featureId);
CREATE TABLE placeAdoptionDecision (
  id TEXT PRIMARY KEY NOT NULL,
  proposalId TEXT NOT NULL REFERENCES placeAdoptionProposal(id) ON DELETE RESTRICT,
  fieldGroup TEXT NOT NULL CHECK(fieldGroup IN ('facts','location')),
  action TEXT NOT NULL CHECK(action IN ('rejected','applied')),
  actorId TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  associationRevision TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(proposalId, fieldGroup)
);
CREATE TRIGGER place_adoption_proposal_no_update BEFORE UPDATE ON placeAdoptionProposal
BEGIN SELECT RAISE(ABORT,'Place adoption evidence is immutable'); END;
CREATE TRIGGER place_adoption_proposal_no_delete BEFORE DELETE ON placeAdoptionProposal
BEGIN SELECT RAISE(ABORT,'Place adoption evidence is immutable'); END;
CREATE TRIGGER place_adoption_decision_no_update BEFORE UPDATE ON placeAdoptionDecision
BEGIN SELECT RAISE(ABORT,'Place adoption decisions are immutable'); END;
CREATE TRIGGER place_adoption_decision_no_delete BEFORE DELETE ON placeAdoptionDecision
BEGIN SELECT RAISE(ABORT,'Place adoption decisions are immutable'); END;
