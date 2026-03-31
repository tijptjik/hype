-- Persist hub/organisation property ordering in assignment tables.
-- This enables unified cross-type ordering without relying on property.rank.

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "hubProperty" (
  "hubId" text NOT NULL REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "propertyId" text NOT NULL REFERENCES "property"("id") ON UPDATE cascade ON DELETE cascade,
  "rank" integer NOT NULL DEFAULT 0,
  PRIMARY KEY("hubId", "propertyId")
);

CREATE TABLE IF NOT EXISTS "organisationProperty" (
  "organisationId" text NOT NULL REFERENCES "organisation"("id") ON UPDATE cascade ON DELETE cascade,
  "propertyId" text NOT NULL REFERENCES "property"("id") ON UPDATE cascade ON DELETE cascade,
  "rank" integer NOT NULL DEFAULT 0,
  PRIMARY KEY("organisationId", "propertyId")
);

-- Backfill hub-scoped property assignments.
INSERT INTO "hubProperty" ("hubId", "propertyId", "rank")
SELECT
  p."hubId",
  p."id",
  ROW_NUMBER() OVER (
    PARTITION BY p."hubId"
    ORDER BY p."key", p."id"
  ) - 1 AS "rank"
FROM "property" p
WHERE p."scope" = 'hub'
  AND p."hubId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "hubProperty" hp
    WHERE hp."hubId" = p."hubId"
      AND hp."propertyId" = p."id"
  );

-- Backfill organisation-scoped property assignments.
INSERT INTO "organisationProperty" ("organisationId", "propertyId", "rank")
SELECT
  p."organisationId",
  p."id",
  ROW_NUMBER() OVER (
    PARTITION BY p."organisationId"
    ORDER BY p."key", p."id"
  ) - 1 AS "rank"
FROM "property" p
WHERE p."scope" = 'organisation'
  AND p."organisationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "organisationProperty" op
    WHERE op."organisationId" = p."organisationId"
      AND op."propertyId" = p."id"
  );

-- Dense-normalize rank for hub assignments.
WITH ranked AS (
  SELECT
    rowid AS rid,
    ROW_NUMBER() OVER (
      PARTITION BY "hubId"
      ORDER BY "rank", "propertyId"
    ) - 1 AS nextRank
  FROM "hubProperty"
)
UPDATE "hubProperty"
SET "rank" = (
  SELECT ranked.nextRank
  FROM ranked
  WHERE ranked.rid = "hubProperty".rowid
);

-- Dense-normalize rank for organisation assignments.
WITH ranked AS (
  SELECT
    rowid AS rid,
    ROW_NUMBER() OVER (
      PARTITION BY "organisationId"
      ORDER BY "rank", "propertyId"
    ) - 1 AS nextRank
  FROM "organisationProperty"
)
UPDATE "organisationProperty"
SET "rank" = (
  SELECT ranked.nextRank
  FROM ranked
  WHERE ranked.rid = "organisationProperty".rowid
);
