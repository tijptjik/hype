PRAGMA defer_foreign_keys=ON;

-- Move project field ordering ownership to projectProperty and drop property.rank.
--
-- Canonical ordering now lives in projectProperty.rank.
-- We first preserve existing project-scoped ordering, then rebuild property table
-- without the rank column.


-- Ensure every project-scoped property has a projectProperty assignment.
INSERT INTO "projectProperty" ("projectId", "propertyId", "rank")
SELECT
  p."projectId",
  p."id",
  p."rank"
FROM "property" p
WHERE p."scope" = 'project'
  AND p."projectId" IS NOT NULL
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "rank" = excluded."rank";

-- Dense-normalize assignment ranks per project.
WITH ranked AS (
  SELECT
    pp."projectId",
    pp."propertyId",
    ROW_NUMBER() OVER (
      PARTITION BY pp."projectId"
      ORDER BY pp."rank", pp."propertyId"
    ) - 1 AS "nextRank"
  FROM "projectProperty" pp
)
UPDATE "projectProperty"
SET "rank" = (
  SELECT r."nextRank"
  FROM ranked r
  WHERE r."projectId" = "projectProperty"."projectId"
    AND r."propertyId" = "projectProperty"."propertyId"
);

CREATE TABLE "__backup_projectProperty" AS
SELECT * FROM "projectProperty";

CREATE TABLE "__backup_propertyI18n" AS
SELECT * FROM "propertyI18n";

CREATE TABLE "__backup_propertyValue" AS
SELECT * FROM "propertyValue";

CREATE TABLE "__backup_propertyValueI18n" AS
SELECT * FROM "propertyValueI18n";

CREATE TABLE "__backup_layerProperty" AS
SELECT * FROM "layerProperty";

CREATE TABLE "__backup_featureProperty" AS
SELECT * FROM "featureProperty";

CREATE TABLE "__backup_featurePropertyI18n" AS
SELECT * FROM "featurePropertyI18n";

CREATE TABLE "__new_property" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade,
  "organisationId" text REFERENCES "organisation"("id") ON UPDATE cascade ON DELETE cascade,
  "hubId" text REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "scope" text NOT NULL DEFAULT 'project',
  "type" text NOT NULL DEFAULT 'classifier',
  "key" text NOT NULL,
  "isTranslatable" integer NOT NULL DEFAULT true,
  "component" text NOT NULL DEFAULT 'SelectField',
  "min" integer,
  "max" integer,
  "isUserContributable" integer NOT NULL DEFAULT true,
  "isDefaultEnabled" integer NOT NULL DEFAULT false,
  "createdAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  "modifiedAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

INSERT INTO "__new_property" (
  "id",
  "projectId",
  "organisationId",
  "hubId",
  "scope",
  "type",
  "key",
  "isTranslatable",
  "component",
  "min",
  "max",
  "isUserContributable",
  "isDefaultEnabled",
  "createdAt",
  "modifiedAt"
)
SELECT
  "id",
  "projectId",
  "organisationId",
  "hubId",
  "scope",
  "type",
  "key",
  "isTranslatable",
  "component",
  "min",
  "max",
  "isUserContributable",
  "isDefaultEnabled",
  "createdAt",
  "modifiedAt"
FROM "property";

DROP TABLE "property";
ALTER TABLE "__new_property" RENAME TO "property";

CREATE INDEX "property_projectId_idx" ON "property" ("projectId");
CREATE INDEX "property_hubId_idx" ON "property" ("hubId");
CREATE INDEX "property_scope_idx" ON "property" ("scope");
CREATE INDEX "property_organisationId_idx" ON "property" ("organisationId");

DELETE FROM "featurePropertyI18n";
DELETE FROM "featureProperty";
DELETE FROM "layerProperty";
DELETE FROM "propertyValueI18n";
DELETE FROM "propertyValue";
DELETE FROM "propertyI18n";
DELETE FROM "projectProperty";

INSERT INTO "projectProperty"
SELECT * FROM "__backup_projectProperty";

INSERT INTO "propertyI18n"
SELECT * FROM "__backup_propertyI18n";

INSERT INTO "propertyValue"
SELECT * FROM "__backup_propertyValue";

INSERT INTO "propertyValueI18n"
SELECT * FROM "__backup_propertyValueI18n";

INSERT INTO "layerProperty"
SELECT * FROM "__backup_layerProperty";

INSERT INTO "featureProperty"
SELECT * FROM "__backup_featureProperty";

INSERT INTO "featurePropertyI18n"
SELECT * FROM "__backup_featurePropertyI18n";

DROP TABLE "__backup_projectProperty";
DROP TABLE "__backup_propertyI18n";
DROP TABLE "__backup_propertyValue";
DROP TABLE "__backup_propertyValueI18n";
DROP TABLE "__backup_layerProperty";
DROP TABLE "__backup_featureProperty";
DROP TABLE "__backup_featurePropertyI18n";

PRAGMA defer_foreign_keys=OFF;
