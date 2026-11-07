-- Correct current Neon image credits; preserve feature, task and revision authorship.
-- IDs are pinned to the reviewed project/account; names are checked before any writes.
CREATE TABLE _neon_contributor_guard (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _neon_contributor_guard (valid)
SELECT CASE WHEN
  (SELECT count(*) FROM project WHERE id = 'EovGYWS-GSon' AND code = 'neon') = 1
  AND (SELECT count(*) FROM user
    WHERE id = 'hw1JTXgrpalUkS4cIWpbN4L0NWeHrEnh'
      AND lower(username) = 'wonderfulbarnacle99') = 1
THEN 1 ELSE 0 END;

-- Include the project cover and all feature assets, including archived/unpublished ones.
-- Preserve every task-linked image, even if its task is a draft or already reviewed.
CREATE TABLE _neon_contributor_images (id TEXT PRIMARY KEY);
INSERT INTO _neon_contributor_images (id)
SELECT i.id FROM image i
WHERE (
  EXISTS (SELECT 1 FROM featureImage fi JOIN feature f ON f.id = fi.featureId
    WHERE fi.imageId = i.id AND f.projectId = 'EovGYWS-GSon')
  OR EXISTS (SELECT 1 FROM project p WHERE p.id = 'EovGYWS-GSon' AND p.imageId = i.id)
)
AND NOT EXISTS (SELECT 1 FROM taskImage ti WHERE ti.imageId = i.id);

-- Image credit is global: abort rather than silently change another project's assets.
INSERT INTO _neon_contributor_guard (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM _neon_contributor_images target
  WHERE EXISTS (SELECT 1 FROM featureImage fi JOIN feature f ON f.id = fi.featureId
      WHERE fi.imageId = target.id AND f.projectId <> 'EovGYWS-GSon')
    OR EXISTS (SELECT 1 FROM project p WHERE p.imageId = target.id AND p.id <> 'EovGYWS-GSon')
    OR EXISTS (SELECT 1 FROM organisation o WHERE o.imageId = target.id)
    OR EXISTS (SELECT 1 FROM hub h WHERE h.imageId = target.id)
) THEN 1 ELSE 0 END;

UPDATE image
SET contributorId = 'hw1JTXgrpalUkS4cIWpbN4L0NWeHrEnh'
WHERE id IN (SELECT id FROM _neon_contributor_images)
  AND contributorId IS NOT 'hw1JTXgrpalUkS4cIWpbN4L0NWeHrEnh';

DROP TABLE _neon_contributor_images;
DROP TABLE _neon_contributor_guard;
