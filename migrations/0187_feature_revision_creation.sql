-- Opt-in only after the complete creation/contribution rehearsal has passed.
CREATE TABLE featureRevisionCreationPolicy (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
INSERT INTO featureRevisionCreationPolicy(singleton,enabled) VALUES(1,0);
-- Only this first, never-published proposal may own a private creation projection.
CREATE TABLE featureInitialRevision (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE RESTRICT,
  proposalId TEXT UNIQUE NOT NULL REFERENCES featureRevisionProposal(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK(mode IN ('staff','contribution'))
);
CREATE TRIGGER feature_initial_revision_insert BEFORE INSERT ON featureInitialRevision
WHEN NOT EXISTS (SELECT 1 FROM featureRevisionProposal p JOIN featureRevisionHead h ON h.featureId=p.featureId
  WHERE p.id=NEW.proposalId AND p.featureId=NEW.featureId AND h.generation=0 AND h.publishedRevisionId IS NULL)
BEGIN SELECT RAISE(ABORT,'Initial Feature proposal owner mismatch'); END;
CREATE TRIGGER feature_initial_revision_update BEFORE UPDATE ON featureInitialRevision
BEGIN SELECT RAISE(ABORT,'Initial Feature proposal is immutable'); END;
CREATE TRIGGER feature_initial_revision_delete BEFORE DELETE ON featureInitialRevision
BEGIN SELECT RAISE(ABORT,'Initial Feature proposal is immutable'); END;
