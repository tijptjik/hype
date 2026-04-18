PRAGMA defer_foreign_keys=ON;

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
  "type" text NOT NULL DEFAULT 'classifier',
  "key" text NOT NULL,
  "isTranslatable" integer NOT NULL DEFAULT true,
  "rank" integer NOT NULL DEFAULT 0,
  "component" text NOT NULL DEFAULT 'SelectField',
  "min" integer,
  "max" integer,
  "isUserContributable" integer NOT NULL DEFAULT true,
  "createdAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  "modifiedAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  "hubId" text REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "scope" text NOT NULL DEFAULT 'project',
  "isDefaultEnabled" integer NOT NULL DEFAULT false
);

INSERT INTO "__new_property" (
  "id",
  "projectId",
  "type",
  "key",
  "isTranslatable",
  "rank",
  "component",
  "min",
  "max",
  "isUserContributable",
  "createdAt",
  "modifiedAt",
  "hubId",
  "scope",
  "isDefaultEnabled"
)
SELECT
  "id",
  "projectId",
  "type",
  "key",
  "isTranslatable",
  "rank",
  "component",
  "min",
  "max",
  "isUserContributable",
  "createdAt",
  "modifiedAt",
  "hubId",
  "scope",
  "isDefaultEnabled"
FROM "property";

DROP TABLE "property";
ALTER TABLE "__new_property" RENAME TO "property";

CREATE INDEX "property_projectId_idx" ON "property" ("projectId");
CREATE INDEX "property_hubId_idx" ON "property" ("hubId");
CREATE INDEX "property_scope_idx" ON "property" ("scope");

DELETE FROM "featurePropertyI18n";
DELETE FROM "featureProperty";
DELETE FROM "layerProperty";
DELETE FROM "propertyValueI18n";
DELETE FROM "propertyValue";
DELETE FROM "propertyI18n";

INSERT INTO "propertyI18n"
SELECT * FROM "__backup_propertyI18n";

INSERT INTO "propertyValue"
SELECT * FROM "__backup_propertyValue";

INSERT INTO "propertyValueI18n"
SELECT * FROM "__backup_propertyValueI18n";

INSERT INTO "layerProperty" (
  "layerId",
  "propertyId",
  "isVisible",
  "isUserContributed"
)
SELECT
  "layerId",
  "propertyId",
  "isVisible",
  "isUserContributed"
FROM "__backup_layerProperty";

INSERT INTO "featureProperty"
SELECT * FROM "__backup_featureProperty";

INSERT INTO "featurePropertyI18n"
SELECT * FROM "__backup_featurePropertyI18n";

DROP TABLE "__backup_propertyI18n";
DROP TABLE "__backup_propertyValue";
DROP TABLE "__backup_propertyValueI18n";
DROP TABLE "__backup_layerProperty";
DROP TABLE "__backup_featureProperty";
DROP TABLE "__backup_featurePropertyI18n";

PRAGMA defer_foreign_keys=OFF;
