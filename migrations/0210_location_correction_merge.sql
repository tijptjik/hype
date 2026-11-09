-- Retain exactly which proposed fields staff accepted; omitted fields are rejected by this decision.
CREATE TABLE IF NOT EXISTS locationCorrectionMerge (
  proposalId TEXT PRIMARY KEY NOT NULL REFERENCES locationCorrectionProposal(id) ON DELETE RESTRICT,
  patch TEXT NOT NULL CHECK(json_valid(patch) AND json_type(patch)='object'),
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS location_correction_merge_update BEFORE UPDATE ON locationCorrectionMerge
BEGIN SELECT RAISE(ABORT,'Location correction merge is immutable'); END;
CREATE TRIGGER IF NOT EXISTS location_correction_merge_delete BEFORE DELETE ON locationCorrectionMerge
BEGIN SELECT RAISE(ABORT,'Location correction merge is immutable'); END;
CREATE TRIGGER IF NOT EXISTS location_correction_merge_pending BEFORE INSERT ON locationCorrectionMerge
WHEN EXISTS(SELECT 1 FROM locationCorrectionDecision WHERE proposalId=NEW.proposalId)
BEGIN SELECT RAISE(ABORT,'Location correction already decided'); END;
