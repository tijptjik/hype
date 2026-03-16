PRAGMA foreign_keys=ON;

-- Seed Food Access layers and their property visibility assignments.

BEGIN TRANSACTION;

INSERT INTO "layer" (
  "id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished",
  "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  '8i4LCCTy5KWm', 'kP31z2fP4-k2', 'LsmysOOa9RoU', '{}', 0, 1,
  '2025-10-01T16:02:39.858Z', NULL, 0, '2025-10-01T15:40:29.209Z', '2025-10-01T17:14:48.689Z'
)
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "metadata" = excluded."metadata",
  "isDefaultVisible" = excluded."isDefaultVisible",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "layer" (
  "id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished",
  "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  'Cb1QTxz6-8yr', 'kP31z2fP4-k2', 'LsmysOOa9RoU', '{}', 0, 1,
  '2025-10-01T16:02:33.849Z', NULL, 0, '2025-10-01T15:40:37.271Z', '2025-10-01T17:15:39.358Z'
)
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "metadata" = excluded."metadata",
  "isDefaultVisible" = excluded."isDefaultVisible",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "layer" (
  "id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished",
  "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  'XiLNvl_lnl9b', 'kP31z2fP4-k2', 'LsmysOOa9RoU', '{}', 0, 1,
  '2025-10-01T16:02:10.421Z', NULL, 0, '2025-10-01T15:40:11.968Z', '2025-10-01T17:13:40.113Z'
)
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "metadata" = excluded."metadata",
  "isDefaultVisible" = excluded."isDefaultVisible",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "layer" (
  "id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished",
  "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  'ch5xRfst-5Pl', 'kP31z2fP4-k2', 'LsmysOOa9RoU', '{}', 0, 1,
  '2025-10-01T16:02:46.972Z', NULL, 0, '2025-10-01T15:40:21.011Z', '2025-10-01T17:16:35.063Z'
)
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "metadata" = excluded."metadata",
  "isDefaultVisible" = excluded."isDefaultVisible",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  '8i4LCCTy5KWm', 'en', 'Recreational Farm', 0, 'Recreational Farm', 0, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  '8i4LCCTy5KWm', 'zh-hans', '休闲农场', 1, '休闲农场', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  '8i4LCCTy5KWm', 'zh-hant', '遊樂場', 1, '遊樂場', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'Cb1QTxz6-8yr', 'en', 'FoodCo', 0, 'FoodCo', 0, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'Cb1QTxz6-8yr', 'zh-hans', '食品公司', 1, '食品公司', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'Cb1QTxz6-8yr', 'zh-hant', '食品公司', 1, '食品公司', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'XiLNvl_lnl9b', 'en', 'Wetmarket', 0, 'Wetmarket', 0, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'XiLNvl_lnl9b', 'zh-hans', '湿货市场', 1, '湿货市场', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'XiLNvl_lnl9b', 'zh-hant', '濕街', 1, '濕街', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'ch5xRfst-5Pl', 'en', 'Grocery Store', 0, 'Grocery Store', 0, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'ch5xRfst-5Pl', 'zh-hans', '杂货店', 1, '杂货店', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "layerI18n" (
  "layerId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'ch5xRfst-5Pl', 'zh-hant', '雜貨店', 1, '雜貨店', 1, '', 1
)
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

DELETE FROM "layerProperty" WHERE "layerId" IN ('8i4LCCTy5KWm', 'Cb1QTxz6-8yr', 'XiLNvl_lnl9b', 'ch5xRfst-5Pl');

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', '6H3OZ41x64bB', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', '7RqvQvMw0Fk5', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', '9Zsd4E4Vi9ZP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'BBYOVU49oSfx', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'FCoxx_YIRlae', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'Hi2Gmv7jwjQj', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'J3E2gk$U23_J', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'TNKWqpSchuU7', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'ZV47U3_RVxuR', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'uWAk1721Ma4_', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'xLSy8o3JDA9K', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'yjiegt5TvcPP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('8i4LCCTy5KWm', 'z8FdPeJrY7e5', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', '6H3OZ41x64bB', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', '7RqvQvMw0Fk5', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', '9Zsd4E4Vi9ZP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'BBYOVU49oSfx', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'FCoxx_YIRlae', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'Hi2Gmv7jwjQj', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'J3E2gk$U23_J', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'TNKWqpSchuU7', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'ZV47U3_RVxuR', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'uWAk1721Ma4_', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'xLSy8o3JDA9K', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'yjiegt5TvcPP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('Cb1QTxz6-8yr', 'z8FdPeJrY7e5', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', '6H3OZ41x64bB', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', '7RqvQvMw0Fk5', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', '9Zsd4E4Vi9ZP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'BBYOVU49oSfx', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'FCoxx_YIRlae', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'Hi2Gmv7jwjQj', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'J3E2gk$U23_J', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'TNKWqpSchuU7', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'ZV47U3_RVxuR', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'uWAk1721Ma4_', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'xLSy8o3JDA9K', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'yjiegt5TvcPP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('XiLNvl_lnl9b', 'z8FdPeJrY7e5', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', '6H3OZ41x64bB', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', '7RqvQvMw0Fk5', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', '9Zsd4E4Vi9ZP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'BBYOVU49oSfx', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'FCoxx_YIRlae', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'Hi2Gmv7jwjQj', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'J3E2gk$U23_J', 0, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'TNKWqpSchuU7', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'ZV47U3_RVxuR', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'uWAk1721Ma4_', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'xLSy8o3JDA9K', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'yjiegt5TvcPP', 1, 1);

INSERT INTO "layerProperty" ("layerId", "propertyId", "isVisible", "isUserContributable")
VALUES ('ch5xRfst-5Pl', 'z8FdPeJrY7e5', 1, 1);

COMMIT;
