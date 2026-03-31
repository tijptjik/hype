-- Backfill projectProperty assignments for the new project property model.
-- Rules:
-- - project-scoped properties are always enabled
-- - inherited properties default to property.isDefaultEnabled
-- - preserve existing rows; only insert missing assignments
-- - normalize rank to a dense sequence per project

PRAGMA foreign_keys=ON;

-- 1) Ensure project-local properties are assigned and enabled.
INSERT INTO projectProperty (projectId, propertyId, isEnabled, rank)
SELECT
  p.id AS projectId,
  pr.id AS propertyId,
  1 AS isEnabled,
  COALESCE((
    SELECT MAX(existing.rank) + 1
    FROM projectProperty AS existing
    WHERE existing.projectId = p.id
  ), 0)
  + ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pr.key, pr.id) - 1 AS rank
FROM project AS p
JOIN property AS pr
  ON pr.scope = 'project'
 AND pr.projectId = p.id
WHERE NOT EXISTS (
  SELECT 1
  FROM projectProperty AS existing
  WHERE existing.projectId = p.id
    AND existing.propertyId = pr.id
);

-- 2) Ensure inherited (organisation + hub/core-hub) properties are assigned.
WITH core_hub AS (
  SELECT id
  FROM hub
  WHERE code = 'core'
  LIMIT 1
),
inherited_candidates AS (
  SELECT
    p.id AS projectId,
    pr.id AS propertyId,
    CASE WHEN pr.isDefaultEnabled = 1 THEN 1 ELSE 0 END AS isEnabled,
    pr.key AS sortKey
  FROM project AS p
  JOIN organisation AS o ON o.id = p.organisationId
  JOIN property AS pr
    ON (
      (pr.scope = 'organisation' AND pr.organisationId = o.id)
      OR (
        pr.scope = 'hub'
        AND (
          pr.hubId = o.hubId
          OR pr.hubId = (SELECT id FROM core_hub)
        )
      )
    )
)
INSERT INTO projectProperty (projectId, propertyId, isEnabled, rank)
SELECT
  c.projectId,
  c.propertyId,
  c.isEnabled,
  COALESCE((
    SELECT MAX(existing.rank) + 1
    FROM projectProperty AS existing
    WHERE existing.projectId = c.projectId
  ), 0)
  + ROW_NUMBER() OVER (
      PARTITION BY c.projectId
      ORDER BY c.sortKey, c.propertyId
    ) - 1 AS rank
FROM inherited_candidates AS c
WHERE NOT EXISTS (
  SELECT 1
  FROM projectProperty AS existing
  WHERE existing.projectId = c.projectId
    AND existing.propertyId = c.propertyId
);

-- 3) Dense-normalize ranks after inserts.
WITH ranked AS (
  SELECT
    rowid AS rid,
    ROW_NUMBER() OVER (
      PARTITION BY projectId
      ORDER BY rank, propertyId
    ) - 1 AS nextRank
  FROM projectProperty
)
UPDATE projectProperty
SET rank = (
  SELECT ranked.nextRank
  FROM ranked
  WHERE ranked.rid = projectProperty.rowid
);
