-- Preserve legacy authorship separately from the migration operation that captured it.
CREATE TABLE featureBaselineAttribution (
  featureId TEXT PRIMARY KEY REFERENCES featureRevisionHead(featureId) ON DELETE RESTRICT,
  publicationId TEXT NOT NULL UNIQUE REFERENCES featureRevisionPublication(id) ON DELETE RESTRICT,
  contributorId TEXT,
  reviewerId TEXT,
  taskId TEXT,
  basis TEXT NOT NULL CHECK(basis IN ('reviewed-task','task-contribution','direct-contribution')),
  recordedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(contributorId IS NOT NULL OR reviewerId IS NOT NULL),
  CHECK((basis='direct-contribution' AND taskId IS NULL AND reviewerId IS NULL)
    OR (basis='task-contribution' AND taskId IS NOT NULL AND reviewerId IS NULL)
    OR (basis='reviewed-task' AND taskId IS NOT NULL AND reviewerId IS NOT NULL))
);

-- Only the creation task establishes Feature authorship. Photo/missing-report reviewers
-- do not become Feature authors. Multiple creation tasks are left unresolved, not guessed.
CREATE VIEW featureBaselineAttributionSource AS
SELECT f.id AS featureId,p.id AS publicationId,
  CASE WHEN t.id IS NULL THEN f.contributorId ELSE t.contributorId END AS contributorId,
  CASE WHEN t.isReviewed=1 AND t.reviewOutcome='accepted' AND t.reviewAction='added-feature'
    THEN t.reviewerId END AS reviewerId,
  t.id AS taskId,
  CASE WHEN t.id IS NULL THEN 'direct-contribution'
    WHEN t.isReviewed=1 AND t.reviewOutcome='accepted' AND t.reviewAction='added-feature' AND t.reviewerId IS NOT NULL
    THEN 'reviewed-task' ELSE 'task-contribution' END AS basis
FROM feature f
JOIN featureRevisionPublication p ON p.featureId=f.id AND p.generation=0
JOIN revisionChangeSet c ON c.id=p.changeSetId AND c.origin='migration'
LEFT JOIN task t ON t.featureId=f.id AND t.type='newFeature'
WHERE (SELECT count(*) FROM task candidate WHERE candidate.featureId=f.id AND candidate.type='newFeature') <= 1
  AND (CASE WHEN t.id IS NULL THEN f.contributorId ELSE t.contributorId END IS NOT NULL
    OR (t.isReviewed=1 AND t.reviewOutcome='accepted' AND t.reviewAction='added-feature' AND t.reviewerId IS NOT NULL));

-- Backfill existing enrollment without rewriting immutable revisions or their change sets.
INSERT INTO featureBaselineAttribution(featureId,publicationId,contributorId,reviewerId,taskId,basis)
SELECT featureId,publicationId,contributorId,reviewerId,taskId,basis FROM featureBaselineAttributionSource;

-- Future enrollment captures the same evidence inside the initial publication transaction.
CREATE TRIGGER feature_baseline_attribution_capture AFTER INSERT ON featureRevisionPublication
WHEN NEW.generation=0
BEGIN
  INSERT INTO featureBaselineAttribution(featureId,publicationId,contributorId,reviewerId,taskId,basis)
  SELECT featureId,publicationId,contributorId,reviewerId,taskId,basis
  FROM featureBaselineAttributionSource WHERE publicationId=NEW.id;
END;

-- Keep historical user/task identifiers even if their live records later change or disappear.
CREATE TRIGGER feature_baseline_attribution_no_update BEFORE UPDATE ON featureBaselineAttribution
BEGIN SELECT RAISE(ABORT,'Feature baseline attribution is immutable'); END;
CREATE TRIGGER feature_baseline_attribution_no_delete BEFORE DELETE ON featureBaselineAttribution
BEGIN SELECT RAISE(ABORT,'Feature baseline attribution is immutable'); END;
