PRAGMA foreign_keys=ON;

-- Remove duplicate projectProperty rows that can survive in dirty databases and
-- cause the admin fields editor to render the same property id multiple times.
-- Keep the lowest-rank / earliest row per (projectId, propertyId), then
-- normalize ranks per project to a dense 0-based sequence.

BEGIN TRANSACTION;

DELETE FROM "projectProperty"
WHERE rowid IN (
  SELECT duplicate_rowid
  FROM (
    SELECT
      rowid AS duplicate_rowid,
      ROW_NUMBER() OVER (
        PARTITION BY "projectId", "propertyId"
        ORDER BY "rank" ASC, rowid ASC
      ) AS duplicate_index
    FROM "projectProperty"
  )
  WHERE duplicate_index > 1
);

WITH ranked AS (
  SELECT
    rowid,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "rank" ASC, rowid ASC
    ) - 1 AS next_rank
  FROM "projectProperty"
)
UPDATE "projectProperty"
SET "rank" = (
  SELECT ranked.next_rank
  FROM ranked
  WHERE ranked.rowid = "projectProperty".rowid
)
WHERE rowid IN (SELECT rowid FROM ranked);

COMMIT;
