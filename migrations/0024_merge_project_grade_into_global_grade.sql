-- Merge project-scoped `grade` fields into the canonical global `grade` field.
--
-- Strategy:
-- 1) Identify old project-grade properties and canonical global-grade property.
-- 2) Ensure each affected project has projectProperty assignment to global grade.
-- 3) Move any project-grade propertyValue rows onto global grade (preserving IDs).
-- 4) Repoint featureProperty / featurePropertyI18n rows from old grade property IDs to global grade.
-- 5) Remove old project-grade property definitions.

-- 1) Ensure projects that used project-scoped grade now have global-grade assignment.
INSERT INTO "projectProperty" ("projectId", "propertyId", "rank")
SELECT
  old_grade."projectId",
  target_global."id" AS "propertyId",
  COALESCE(
    (
      SELECT MAX(pp."rank") + 1
      FROM "projectProperty" pp
      WHERE pp."projectId" = old_grade."projectId"
    ),
    0
  ) AS "rank"
FROM "property" old_grade
CROSS JOIN (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
) AS target_global
WHERE old_grade."key" = 'grade'
  AND old_grade."scope" = 'project'
  AND old_grade."projectId" IS NOT NULL
ON CONFLICT("projectId", "propertyId") DO NOTHING;

-- 2) Move any project-grade option rows (if present) onto global grade.
WITH target_global AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
),
old_values AS (
  SELECT
    pv."id" AS "valueId",
    ROW_NUMBER() OVER (ORDER BY p."projectId", pv."rank", pv."id") - 1 AS "offset"
  FROM "propertyValue" pv
  JOIN "property" p ON p."id" = pv."propertyId"
  WHERE p."key" = 'grade'
    AND p."scope" = 'project'
),
base_rank AS (
  SELECT COALESCE(MAX(pv."rank"), -1) AS "maxRank"
  FROM "propertyValue" pv
  JOIN target_global tg ON tg."id" = pv."propertyId"
)
UPDATE "propertyValue"
SET
  "propertyId" = (SELECT "id" FROM target_global),
  "rank" = (SELECT "maxRank" FROM base_rank) + 1 + (
    SELECT ov."offset"
    FROM old_values ov
    WHERE ov."valueId" = "propertyValue"."id"
  )
WHERE "id" IN (SELECT "valueId" FROM old_values);

-- 3) Insert non-conflicting featureProperty rows for global grade.
WITH target_global AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
),
old_project_grade AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
)
INSERT INTO "featureProperty" ("featureId", "propertyId", "propertyValueId", "value")
SELECT
  fp."featureId",
  (SELECT "id" FROM target_global) AS "propertyId",
  fp."propertyValueId",
  fp."value"
FROM "featureProperty" fp
WHERE fp."propertyId" IN (SELECT "id" FROM old_project_grade)
  AND NOT EXISTS (
    SELECT 1
    FROM "featureProperty" existing
    WHERE existing."featureId" = fp."featureId"
      AND existing."propertyId" = (SELECT "id" FROM target_global)
  );

-- 4) Merge data into already-existing global-grade featureProperty rows.
WITH target_global AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
),
old_project_grade AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
)
UPDATE "featureProperty" AS tgt
SET
  "propertyValueId" = COALESCE(
    tgt."propertyValueId",
    (
      SELECT src."propertyValueId"
      FROM "featureProperty" src
      WHERE src."featureId" = tgt."featureId"
        AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
      LIMIT 1
    )
  ),
  "value" = COALESCE(
    tgt."value",
    (
      SELECT src."value"
      FROM "featureProperty" src
      WHERE src."featureId" = tgt."featureId"
        AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
      LIMIT 1
    )
  )
WHERE tgt."propertyId" = (SELECT "id" FROM target_global)
  AND EXISTS (
    SELECT 1
    FROM "featureProperty" src
    WHERE src."featureId" = tgt."featureId"
      AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
  );

-- 5) Insert non-conflicting featurePropertyI18n rows for global grade.
WITH target_global AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
),
old_project_grade AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
)
INSERT INTO "featurePropertyI18n" ("featureId", "propertyId", "locale", "value", "valueGen")
SELECT
  fpi."featureId",
  (SELECT "id" FROM target_global) AS "propertyId",
  fpi."locale",
  fpi."value",
  fpi."valueGen"
FROM "featurePropertyI18n" fpi
WHERE fpi."propertyId" IN (SELECT "id" FROM old_project_grade)
  AND NOT EXISTS (
    SELECT 1
    FROM "featurePropertyI18n" existing
    WHERE existing."featureId" = fpi."featureId"
      AND existing."propertyId" = (SELECT "id" FROM target_global)
      AND existing."locale" = fpi."locale"
  );

-- 6) Merge data into already-existing global-grade featurePropertyI18n rows.
WITH target_global AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'global'
  ORDER BY CASE WHEN "id" = 'gPropGrade01' THEN 0 ELSE 1 END, "id"
  LIMIT 1
),
old_project_grade AS (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
)
UPDATE "featurePropertyI18n" AS tgt
SET
  "value" = COALESCE(
    tgt."value",
    (
      SELECT src."value"
      FROM "featurePropertyI18n" src
      WHERE src."featureId" = tgt."featureId"
        AND src."locale" = tgt."locale"
        AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
      LIMIT 1
    )
  ),
  "valueGen" = COALESCE(
    tgt."valueGen",
    (
      SELECT src."valueGen"
      FROM "featurePropertyI18n" src
      WHERE src."featureId" = tgt."featureId"
        AND src."locale" = tgt."locale"
        AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
      LIMIT 1
    )
  )
WHERE tgt."propertyId" = (SELECT "id" FROM target_global)
  AND EXISTS (
    SELECT 1
    FROM "featurePropertyI18n" src
    WHERE src."featureId" = tgt."featureId"
      AND src."locale" = tgt."locale"
      AND src."propertyId" IN (SELECT "id" FROM old_project_grade)
  );

-- 7) Remove old feature grade rows.
DELETE FROM "featurePropertyI18n"
WHERE "propertyId" IN (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
);

DELETE FROM "featureProperty"
WHERE "propertyId" IN (
  SELECT "id"
  FROM "property"
  WHERE "key" = 'grade' AND "scope" = 'project'
);

-- 8) Remove project-scoped grade properties (cascades propertyI18n/projectProperty/propertyValue as needed).
DELETE FROM "property"
WHERE "key" = 'grade'
  AND "scope" = 'project';
