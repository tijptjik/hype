-- Shared corrections have their own review; accepting a Feature proposal cannot approve them.
CREATE TABLE locationCorrectionProposal (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE RESTRICT,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  associationVersion TEXT NOT NULL,
  factsRevisionId TEXT NOT NULL REFERENCES locationRevision(id) ON DELETE RESTRICT,
  locationRevisionId TEXT NOT NULL REFERENCES locationRevision(id) ON DELETE RESTRICT,
  expectedOrganisationRevision TEXT REFERENCES organisationLocation(id) ON DELETE RESTRICT,
  beforeOverrides TEXT NOT NULL CHECK(json_valid(beforeOverrides)),
  afterOverrides TEXT NOT NULL CHECK(json_valid(afterOverrides)),
  patch TEXT NOT NULL CHECK(json_valid(patch)),
  beforeValues TEXT NOT NULL CHECK(json_valid(beforeValues)),
  afterValues TEXT NOT NULL CHECK(json_valid(afterValues)),
  actorId TEXT NOT NULL,
  reason TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX location_correction_proposal_feature ON locationCorrectionProposal(featureId,createdAt);
CREATE TABLE locationCorrectionDecision (
  proposalId TEXT PRIMARY KEY NOT NULL REFERENCES locationCorrectionProposal(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK(outcome IN ('accepted','rejected')),
  organisationRevision TEXT REFERENCES organisationLocation(id) ON DELETE RESTRICT,
  actorId TEXT NOT NULL,
  reason TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TRIGGER location_correction_proposal_update BEFORE UPDATE ON locationCorrectionProposal
BEGIN SELECT RAISE(ABORT,'Location correction proposal is immutable'); END;
CREATE TRIGGER location_correction_proposal_delete BEFORE DELETE ON locationCorrectionProposal
BEGIN SELECT RAISE(ABORT,'Location correction proposal is immutable'); END;
CREATE TRIGGER location_correction_decision_update BEFORE UPDATE ON locationCorrectionDecision
BEGIN SELECT RAISE(ABORT,'Location correction decision is immutable'); END;
CREATE TRIGGER location_correction_decision_delete BEFORE DELETE ON locationCorrectionDecision
BEGIN SELECT RAISE(ABORT,'Location correction decision is immutable'); END;
-- Acceptance must name the exact shared owner and location; rejection never creates a revision.
CREATE TRIGGER location_correction_decision_owner BEFORE INSERT ON locationCorrectionDecision
WHEN (NEW.outcome='rejected' AND NEW.organisationRevision IS NOT NULL)
  OR (NEW.outcome='accepted' AND NOT EXISTS (
    SELECT 1 FROM locationCorrectionProposal p JOIN organisationLocation r
      ON r.organisationId=p.organisationId AND r.locationId=p.locationId
    WHERE p.id=NEW.proposalId AND r.id=NEW.organisationRevision
  ))
BEGIN SELECT RAISE(ABORT,'Location correction decision owner mismatch'); END;
