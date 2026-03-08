-- Seed Breadline layer field setup:
-- 1) Ensure the hkfoodworks organisation classifier property exists.
-- 2) Normalize key property ranks to match Breadline field ordering.
-- 3) Seed two Breadline layers (including i18n and layerProperty assignments).
-- - kin0shUTfrUi
-- - 1msQMcuqfHrP
--
-- Source extracted from local admin data on 2026-03-08.

BEGIN TRANSACTION;

INSERT INTO "property" (
  "id",
  "projectId",
  "organisationId",
  "hubId",
  "scope",
  "type",
  "key",
  "rank",
  "component",
  "min",
  "max",
  "isTranslatable",
  "isDefaultEnabled"
)
VALUES (
  'k5h8syEZBSyS',
  NULL,
  '2u4orWMxRNbz',
  NULL,
  'organisation',
  'classifier',
  'preferredContactMethod',
  0,
  'SelectField',
  NULL,
  NULL,
  1,
  1
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "organisationId" = excluded."organisationId",
  "hubId" = excluded."hubId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "rank" = excluded."rank",
  "component" = excluded."component",
  "min" = excluded."min",
  "max" = excluded."max",
  "isTranslatable" = excluded."isTranslatable",
  "isDefaultEnabled" = excluded."isDefaultEnabled";

DELETE FROM "propertyI18n"
WHERE "propertyId" = 'k5h8syEZBSyS';

INSERT INTO "propertyI18n" (
  "propertyId",
  "locale",
  "label",
  "placeholder",
  "labelGen",
  "placeholderGen"
)
VALUES
  ('k5h8syEZBSyS', 'en', 'Preferred Contact Method', 'Select method', 0, 0),
  ('k5h8syEZBSyS', 'zh-hans', '首选接触方式', '选法', 0, 0),
  ('k5h8syEZBSyS', 'zh-hant', '首選聯絡方式', '選法', 0, 0);

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES
  ('RnR4ULEGQmD6', 'k5h8syEZBSyS', 0, NULL),
  ('F9X9gmy9PLZe', 'k5h8syEZBSyS', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValueI18n" (
  "propertyValueId",
  "locale",
  "value",
  "valueGen"
)
VALUES
  ('RnR4ULEGQmD6', 'en', 'Call', 0),
  ('RnR4ULEGQmD6', 'zh-hans', '叫声', 0),
  ('RnR4ULEGQmD6', 'zh-hant', '嗌', 0),
  ('F9X9gmy9PLZe', 'en', 'WhatsApp', 0),
  ('F9X9gmy9PLZe', 'zh-hans', 'WhatsApp', 0),
  ('F9X9gmy9PLZe', 'zh-hant', 'WhatsApp', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

-- Align property ranks used by Breadline layer field ordering.
UPDATE "property"
SET "rank" = 0
WHERE "id" IN ('WhWlW8KcN2wq', 'k5h8syEZBSyS', 'gPropPhNum01');

UPDATE "property"
SET "rank" = 1
WHERE "id" IN ('gPropGrade01', 'gPropWaNum01');

UPDATE "property"
SET "rank" = 2
WHERE "id" = 'gPropMtrSt01';

UPDATE "property"
SET "rank" = 3
WHERE "id" = 'gPropMtrEx01';

INSERT INTO "layer" (
  "id",
  "organisationId",
  "projectId",
  "metadata",
  "isDefaultVisible",
  "isPublished",
  "localIsPublished",
  "publishedAt",
  "publisherId",
  "isArchived",
  "localIsArchived",
  "createdAt",
  "modifiedAt"
)
VALUES
  (
    '1msQMcuqfHrP',
    '2u4orWMxRNbz',
    'UMsz5DHb29Lx',
    '{}',
    0,
    0,
    NULL,
    NULL,
    NULL,
    0,
    NULL,
    '2026-03-08T07:28:35.164Z',
    '2026-03-08T07:30:45.684Z'
  ),
  (
    'kin0shUTfrUi',
    '2u4orWMxRNbz',
    'UMsz5DHb29Lx',
    '{}',
    0,
    0,
    NULL,
    NULL,
    NULL,
    0,
    NULL,
    '2026-03-08T07:32:12.608Z',
    '2026-03-08T07:45:06.242Z'
  )
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "metadata" = excluded."metadata",
  "isDefaultVisible" = excluded."isDefaultVisible",
  "isPublished" = excluded."isPublished",
  "localIsPublished" = excluded."localIsPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "localIsArchived" = excluded."localIsArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "layerI18n" (
  "layerId",
  "locale",
  "name",
  "nameGen",
  "nameShort",
  "nameShortGen",
  "description",
  "descriptionGen"
)
VALUES
  (
    '1msQMcuqfHrP',
    'en',
    'Donors',
    1,
    'Donors',
    1,
    'Bakeries and convenience stores',
    1
  ),
  (
    '1msQMcuqfHrP',
    'zh-hans',
    '捐赠者',
    1,
    '捐赠者',
    1,
    '面包店和便利店',
    1
  ),
  (
    '1msQMcuqfHrP',
    'zh-hant',
    '捐款者',
    1,
    '捐款者',
    1,
    '麵包店同便利店',
    1
  ),
  (
    'kin0shUTfrUi',
    'en',
    'Dropoff Points',
    1,
    'Dropoffs',
    1,
    'Consolidation points for donated goods',
    1
  ),
  (
    'kin0shUTfrUi',
    'zh-hans',
    '下车点',
    1,
    '下车站',
    1,
    '捐赠物品的整合点',
    1
  ),
  (
    'kin0shUTfrUi',
    'zh-hant',
    '落客點',
    1,
    '落差',
    1,
    '捐物集運點',
    1
  )
ON CONFLICT("layerId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

DELETE FROM "layerProperty"
WHERE "layerId" IN ('1msQMcuqfHrP', 'kin0shUTfrUi');

INSERT INTO "layerProperty" (
  "layerId",
  "propertyId",
  "isVisible",
  "isUserContributable"
)
VALUES
  ('1msQMcuqfHrP', 'WhWlW8KcN2wq', 1, 1),
  ('1msQMcuqfHrP', 'k5h8syEZBSyS', 1, 0),
  ('1msQMcuqfHrP', 'gPropGrade01', 1, 0),
  ('1msQMcuqfHrP', 'gPropMtrEx01', 1, 0),
  ('1msQMcuqfHrP', 'gPropMtrSt01', 1, 0),
  ('1msQMcuqfHrP', 'gPropPhNum01', 1, 1),
  ('1msQMcuqfHrP', 'gPropWaNum01', 1, 1),
  ('kin0shUTfrUi', 'WhWlW8KcN2wq', 0, 0),
  ('kin0shUTfrUi', 'k5h8syEZBSyS', 0, 0),
  ('kin0shUTfrUi', 'gPropGrade01', 0, 0),
  ('kin0shUTfrUi', 'gPropMtrEx01', 1, 0),
  ('kin0shUTfrUi', 'gPropMtrSt01', 1, 0),
  ('kin0shUTfrUi', 'gPropPhNum01', 0, 0),
  ('kin0shUTfrUi', 'gPropWaNum01', 0, 0);

COMMIT;
