-- Remove the nine empty drafts reviewed during MTR cleanup (Refs #213).
-- Run through D1 migrations as one atomic transaction. Already absent records are harmless.
-- Preserve any target that has acquired content, user activity, or a submitted task.
CREATE TABLE _empty_feature_drafts_0100 (id TEXT PRIMARY KEY NOT NULL);

INSERT INTO _empty_feature_drafts_0100 (id)
SELECT f.id FROM feature AS f
WHERE (
  (f.layerId = '7akti7OImSFg' AND f.projectId = 'YuSFnia9VOtG' AND f.id IN (
    'mWqEhnHbz8ku', 'U0cPEN2dbTV6', 'boFmGOuBWLQK', 'OuTbp2HH9f0U',
    'NT4Op1yxia9v', 'rU3itBEni4UY', 'fhk8VjMF0JyA', '4rDNLUH_3wc1'
  ))
  OR (f.layerId = 'RfWMLs_jW6QJ' AND f.projectId = '-z26MuNRTJwi' AND f.id = 'vUD-KShRg3ss')
)
AND f.isDraft = 1
AND f.isPublished = 0 AND coalesce(f.localIsPublished, 0) = 0
AND f.publishedAt IS NULL AND f.publisherId IS NULL
-- These empty drafts carry isPendingReview=1; task.isDraft below guards submission.
AND coalesce(f.addressMeta, '{}') IN ('', '{}')
AND NOT EXISTS (
  SELECT 1 FROM featureI18n AS i WHERE i.featureId = f.id AND (
    coalesce(i.title, '') <> '' OR coalesce(i.description, '') <> ''
    OR coalesce(i.displayAddress, '') <> ''
    OR coalesce(i.addressProperties, '{}') NOT IN ('', '{}')
  )
)
AND NOT EXISTS (SELECT 1 FROM featureImage WHERE featureId = f.id)
AND NOT EXISTS (SELECT 1 FROM featureProperty WHERE featureId = f.id)
AND NOT EXISTS (SELECT 1 FROM featurePropertyI18n WHERE featureId = f.id)
AND NOT EXISTS (SELECT 1 FROM userFeature WHERE featureId = f.id)
AND NOT EXISTS (SELECT 1 FROM breadlineImportFeature WHERE featureId = f.id)
AND NOT EXISTS (
  SELECT 1 FROM task AS t WHERE t.featureId = f.id AND (
    t.type <> 'newFeature' OR t.isDraft <> 1 OR t.isReviewed <> 0
    OR coalesce(t.message, '') <> '' OR t.reviewerId IS NOT NULL
    OR t.reviewOutcome IS NOT NULL OR t.reviewAction IS NOT NULL
    OR t.reviewReason IS NOT NULL
  )
);

-- featureI18n has no feature foreign key; remove it explicitly after freezing eligibility.
-- Its search-document cascade also removes the corresponding FTS entries.
DELETE FROM featureI18n WHERE featureId IN (SELECT id FROM _empty_feature_drafts_0100);

-- Cascades remove draft tasks and generated spatial, division, count and job rows.
-- Shared contributors, projects, layers and media are retained.
DELETE FROM feature WHERE id IN (SELECT id FROM _empty_feature_drafts_0100);
DROP TABLE _empty_feature_drafts_0100;
