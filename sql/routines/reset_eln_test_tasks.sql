PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Reset repeatable ELN test tasks, their dedicated features, and related image bindings.

DELETE FROM "taskImage"
WHERE "taskId" IN (
  'elnTestRmTask01',
  'elnTestRmTask02',
  'elnTestRmTask03',
  'elnTestRmTask04',
  'elnTestNpTask01',
  'elnTestNpTask02',
  'elnTestNpTask03',
  'elnTestNpTask04',
  'elnTestNfTask01',
  'elnTestNfTask02',
  'elnTestNfTask03',
  'elnTestNfTask04'
);

DELETE FROM "featureImage"
WHERE "featureId" IN (
  'elnTestRmFeature01',
  'elnTestRmFeature02',
  'elnTestRmFeature03',
  'elnTestRmFeature04',
  'elnTestNpFeature01',
  'elnTestNpFeature02',
  'elnTestNpFeature03',
  'elnTestNpFeature04',
  'elnTestNfFeature01',
  'elnTestNfFeature02',
  'elnTestNfFeature03',
  'elnTestNfFeature04'
);

DELETE FROM "featureI18n"
WHERE "featureId" IN (
  'elnTestRmFeature01',
  'elnTestRmFeature02',
  'elnTestRmFeature03',
  'elnTestRmFeature04',
  'elnTestNpFeature01',
  'elnTestNpFeature02',
  'elnTestNpFeature03',
  'elnTestNpFeature04',
  'elnTestNfFeature01',
  'elnTestNfFeature02',
  'elnTestNfFeature03',
  'elnTestNfFeature04'
);

DELETE FROM "task"
WHERE "id" IN (
  'elnTestRmTask01',
  'elnTestRmTask02',
  'elnTestRmTask03',
  'elnTestRmTask04',
  'elnTestNpTask01',
  'elnTestNpTask02',
  'elnTestNpTask03',
  'elnTestNpTask04',
  'elnTestNfTask01',
  'elnTestNfTask02',
  'elnTestNfTask03',
  'elnTestNfTask04'
);

DELETE FROM "feature"
WHERE "id" IN (
  'elnTestRmFeature01',
  'elnTestRmFeature02',
  'elnTestRmFeature03',
  'elnTestRmFeature04',
  'elnTestNpFeature01',
  'elnTestNpFeature02',
  'elnTestNpFeature03',
  'elnTestNpFeature04',
  'elnTestNfFeature01',
  'elnTestNfFeature02',
  'elnTestNfFeature03',
  'elnTestNfFeature04'
);

INSERT INTO "feature" (
  "id",
  "organisationId",
  "projectId",
  "layerId",
  "contributorId",
  "geometry",
  "addressMeta",
  "isPublished",
  "publisherId",
  "publishedAt",
  "isPendingReview",
  "isArchived",
  "isIntangible",
  "isVisitable",
  "createdAt",
  "modifiedAt"
)
VALUES
  ('elnTestRmFeature01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1497, 22.2851)), json_object('longitude', 114.1497, 'latitude', 22.2851), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:00:00.000Z', 0, 0, 1, 1, '2026-03-18T09:00:00.000Z', '2026-03-20T01:01:00.000Z'),
  ('elnTestRmFeature02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1542, 22.2817)), json_object('longitude', 114.1542, 'latitude', 22.2817), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:05:00.000Z', 0, 0, 0, 1, '2026-03-18T09:05:00.000Z', '2026-03-20T01:02:00.000Z'),
  ('elnTestRmFeature03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1521, 22.2802)), json_object('longitude', 114.1521, 'latitude', 22.2802), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:10:00.000Z', 0, 0, 0, 1, '2026-03-18T09:10:00.000Z', '2026-03-20T01:03:00.000Z'),
  ('elnTestRmFeature04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1508, 22.2841)), json_object('longitude', 114.1508, 'latitude', 22.2841), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:15:00.000Z', 0, 0, 0, 1, '2026-03-18T09:15:00.000Z', '2026-03-20T01:04:00.000Z'),
  ('elnTestNpFeature01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1559, 22.2813)), json_object('longitude', 114.1559, 'latitude', 22.2813), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:20:00.000Z', 0, 0, 0, 1, '2026-03-18T09:20:00.000Z', '2026-03-20T02:01:00.000Z'),
  ('elnTestNpFeature02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1528, 22.2835)), json_object('longitude', 114.1528, 'latitude', 22.2835), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:25:00.000Z', 0, 0, 0, 1, '2026-03-18T09:25:00.000Z', '2026-03-20T02:02:00.000Z'),
  ('elnTestNpFeature03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1479, 22.2846)), json_object('longitude', 114.1479, 'latitude', 22.2846), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:30:00.000Z', 0, 0, 0, 1, '2026-03-18T09:30:00.000Z', '2026-03-20T02:03:00.000Z'),
  ('elnTestNpFeature04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1583, 22.2796)), json_object('longitude', 114.1583, 'latitude', 22.2796), 1, 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-03-18T09:35:00.000Z', 0, 0, 0, 1, '2026-03-18T09:35:00.000Z', '2026-03-20T02:04:00.000Z'),
  ('elnTestNfFeature01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1512, 22.2827)), json_object('longitude', 114.1512, 'latitude', 22.2827), 0, NULL, NULL, 0, 0, 0, 1, '2026-03-18T09:40:00.000Z', '2026-03-20T03:01:00.000Z'),
  ('elnTestNfFeature02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1548, 22.2809)), json_object('longitude', 114.1548, 'latitude', 22.2809), 0, NULL, NULL, 1, 0, 0, 1, '2026-03-18T09:45:00.000Z', '2026-03-20T03:02:00.000Z'),
  ('elnTestNfFeature03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1567, 22.2801)), json_object('longitude', 114.1567, 'latitude', 22.2801), 0, NULL, NULL, 1, 0, 0, 1, '2026-03-18T09:50:00.000Z', '2026-03-20T03:03:00.000Z'),
  ('elnTestNfFeature04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'vli8hfmD-XEZ', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', json_object('type', 'Point', 'coordinates', json_array(114.1488, 22.2844)), json_object('longitude', 114.1488, 'latitude', 22.2844), 0, NULL, NULL, 1, 0, 0, 1, '2026-03-18T09:55:00.000Z', '2026-03-20T03:04:00.000Z');

INSERT INTO "featureI18n" (
  "featureId",
  "locale",
  "title",
  "titleGen",
  "description",
  "descriptionGen",
  "displayAddress",
  "displayAddressGen",
  "addressProperties"
)
VALUES
  ('elnTestRmFeature01', 'en', 'glorp amber hush', 0, 'snell crux wobble lumen', 0, '12 Jervois St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestRmFeature01', 'zh-hans', 'glorp amber hush hs', 0, 'snell crux wobble lumen hs', 0, '12 Jervois St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestRmFeature01', 'zh-hant', 'glorp amber hush ht', 0, 'snell crux wobble lumen ht', 0, '12 Jervois St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestRmFeature02', 'en', 'mizzle torque fern', 0, 'plume raster quip delta', 0, '29 Queens Road Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature02', 'zh-hans', 'mizzle torque fern hs', 0, 'plume raster quip delta hs', 0, '29 Queens Road Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature02', 'zh-hant', 'mizzle torque fern ht', 0, 'plume raster quip delta ht', 0, '29 Queens Road Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature03', 'en', 'brink vapor spline', 0, 'clack orbit fuzz lantern', 0, '41 Aberdeen St, Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature03', 'zh-hans', 'brink vapor spline hs', 0, 'clack orbit fuzz lantern hs', 0, '41 Aberdeen St, Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature03', 'zh-hant', 'brink vapor spline ht', 0, 'clack orbit fuzz lantern ht', 0, '41 Aberdeen St, Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature04', 'en', 'quill mustard echo', 0, 'trill axle soda velvet', 0, '3 Shin Hing St, Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature04', 'zh-hans', 'quill mustard echo hs', 0, 'trill axle soda velvet hs', 0, '3 Shin Hing St, Central, Hong Kong', 0, '{}'),
  ('elnTestRmFeature04', 'zh-hant', 'quill mustard echo ht', 0, 'trill axle soda velvet ht', 0, '3 Shin Hing St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature01', 'en', 'wobble satin prism', 0, 'glint mortar ripple zinc', 0, '86 Wellington St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature01', 'zh-hans', 'wobble satin prism hs', 0, 'glint mortar ripple zinc hs', 0, '86 Wellington St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature01', 'zh-hant', 'wobble satin prism ht', 0, 'glint mortar ripple zinc ht', 0, '86 Wellington St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature02', 'en', 'ruffle cobalt span', 0, 'snip marrow ticker glade', 0, '22 Staunton St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature02', 'zh-hans', 'ruffle cobalt span hs', 0, 'snip marrow ticker glade hs', 0, '22 Staunton St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature02', 'zh-hant', 'ruffle cobalt span ht', 0, 'snip marrow ticker glade ht', 0, '22 Staunton St, Central, Hong Kong', 0, '{}'),
  ('elnTestNpFeature03', 'en', 'purl velvet axle', 0, 'flint meadow quark saddle', 0, '18 Tai Ping Shan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNpFeature03', 'zh-hans', 'purl velvet axle hs', 0, 'flint meadow quark saddle hs', 0, '18 Tai Ping Shan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNpFeature03', 'zh-hant', 'purl velvet axle ht', 0, 'flint meadow quark saddle ht', 0, '18 Tai Ping Shan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNpFeature04', 'en', 'clove static ember', 0, 'murmur axle tonic pebble', 0, '5 Po Yan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNpFeature04', 'zh-hans', 'clove static ember hs', 0, 'murmur axle tonic pebble hs', 0, '5 Po Yan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNpFeature04', 'zh-hant', 'clove static ember ht', 0, 'murmur axle tonic pebble ht', 0, '5 Po Yan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNfFeature01', 'en', 'snarf opal hinge', 0, 'drift pickle mango quip', 0, '10 Upper Lascar Row, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNfFeature01', 'zh-hans', 'snarf opal hinge hs', 0, 'drift pickle mango quip hs', 0, '10 Upper Lascar Row, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNfFeature01', 'zh-hant', 'snarf opal hinge ht', 0, 'drift pickle mango quip ht', 0, '10 Upper Lascar Row, Sheung Wan, Hong Kong', 0, '{}'),
  ('elnTestNfFeature02', 'en', 'thrum lilac socket', 0, 'ribbon yodel amber spindle', 0, '52 Hollywood Rd, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature02', 'zh-hans', 'thrum lilac socket hs', 0, 'ribbon yodel amber spindle hs', 0, '52 Hollywood Rd, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature02', 'zh-hant', 'thrum lilac socket ht', 0, 'ribbon yodel amber spindle ht', 0, '52 Hollywood Rd, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature03', 'en', 'crimp walnut toggle', 0, 'plaza wobble nectar spline', 0, '14 Gough St, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature03', 'zh-hans', 'crimp walnut toggle hs', 0, 'plaza wobble nectar spline hs', 0, '14 Gough St, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature03', 'zh-hant', 'crimp walnut toggle ht', 0, 'plaza wobble nectar spline ht', 0, '14 Gough St, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature04', 'en', 'fable copper latch', 0, 'quartz nibble cider orbit', 0, '8 Bridges St, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature04', 'zh-hans', 'fable copper latch hs', 0, 'quartz nibble cider orbit hs', 0, '8 Bridges St, Central, Hong Kong', 0, '{}'),
  ('elnTestNfFeature04', 'zh-hant', 'fable copper latch ht', 0, 'quartz nibble cider orbit ht', 0, '8 Bridges St, Central, Hong Kong', 0, '{}');

INSERT INTO "task" (
  "id",
  "organisationId",
  "projectId",
  "featureId",
  "contributorId",
  "reviewerId",
  "type",
  "message",
  "isReviewed",
  "reviewOutcome",
  "reviewAction",
  "reviewReason",
  "createdAt",
  "modifiedAt"
)
VALUES
  ('elnTestRmTask01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestRmFeature01', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'reportedMissing', 'glorp snare filament', 1, 'accepted', 'set-intangible', NULL, '2026-03-20T01:01:01.000Z', '2026-03-20T01:01:01.000Z'),
  ('elnTestRmTask02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestRmFeature02', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'reportedMissing', 'mizzle crate onion', 0, NULL, NULL, NULL, '2026-03-20T01:02:01.000Z', '2026-03-20T01:02:01.000Z'),
  ('elnTestRmTask03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestRmFeature03', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'reportedMissing', 'brink tonic pickle', 0, NULL, NULL, NULL, '2026-03-20T01:03:01.000Z', '2026-03-20T01:03:01.000Z'),
  ('elnTestRmTask04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestRmFeature04', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'reportedMissing', 'quill vapor wicket', 0, NULL, NULL, NULL, '2026-03-20T01:04:01.000Z', '2026-03-20T01:04:01.000Z'),
  ('elnTestNpTask01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNpFeature01', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'newPhoto', 'wobble flax ember', 1, 'accepted', 'added-all-photos', NULL, '2026-03-20T02:01:01.000Z', '2026-03-20T02:01:01.000Z'),
  ('elnTestNpTask02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNpFeature02', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newPhoto', 'ruffle brass orbit', 0, NULL, NULL, NULL, '2026-03-20T02:02:01.000Z', '2026-03-20T02:02:01.000Z'),
  ('elnTestNpTask03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNpFeature03', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newPhoto', 'purl glade socket', 0, NULL, NULL, NULL, '2026-03-20T02:03:01.000Z', '2026-03-20T02:03:01.000Z'),
  ('elnTestNpTask04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNpFeature04', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newPhoto', 'clove marble tonic', 0, NULL, NULL, NULL, '2026-03-20T02:04:01.000Z', '2026-03-20T02:04:01.000Z'),
  ('elnTestNfTask01', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNfFeature01', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'newFeature', 'snarf pollen axle', 1, 'accepted', 'added-feature', NULL, '2026-03-20T03:01:01.000Z', '2026-03-20T03:01:01.000Z'),
  ('elnTestNfTask02', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNfFeature02', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newFeature', 'thrum ladder cider', 0, NULL, NULL, NULL, '2026-03-20T03:02:01.000Z', '2026-03-20T03:02:01.000Z'),
  ('elnTestNfTask03', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNfFeature03', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newFeature', 'crimp signal nectarine', 0, NULL, NULL, NULL, '2026-03-20T03:03:01.000Z', '2026-03-20T03:03:01.000Z'),
  ('elnTestNfTask04', '8dEPyZg_5ov_', 'vGBvWfSZNELM', 'elnTestNfFeature04', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', NULL, 'newFeature', 'fable ribbon socket', 0, NULL, NULL, NULL, '2026-03-20T03:04:01.000Z', '2026-03-20T03:04:01.000Z');

INSERT INTO "featureImage" (
  "featureId",
  "imageId",
  "intent",
  "isPublished",
  "publishedAt",
  "publisherId"
)
WITH image_pool AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (
    SELECT "id"
    FROM "image"
    WHERE COALESCE("isArchived", 0) = 0
    ORDER BY "id"
    LIMIT 11
  )
)
SELECT 'elnTestRmFeature01', "id", 'research', 0, NULL, NULL
FROM image_pool
WHERE "slot" = 1;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestRmFeature02', "id", 'research', 0, NULL, NULL FROM image_pool WHERE "slot" = 2;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestRmFeature03', "id", 'research', 0, NULL, NULL FROM image_pool WHERE "slot" = 3;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestRmFeature04', "id", 'research', 0, NULL, NULL FROM image_pool WHERE "slot" = 4;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNpFeature01', "id", 'undefined', 1, '2026-03-20T02:01:30.000Z', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM'
FROM image_pool WHERE "slot" = 5;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNpFeature02', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" IN (1, 2, 3, 4, 5, 6);

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNpFeature03', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" = 7;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNpFeature04', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" IN (4, 5, 8, 9, 10, 11);

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNfFeature01', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" = 10;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNfFeature02', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" IN (1, 2, 3, 8, 9, 11);

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNfFeature03', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" = 6;

INSERT INTO "featureImage" ("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId")
WITH image_pool AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "slot"
  FROM (SELECT "id" FROM "image" WHERE COALESCE("isArchived", 0) = 0 ORDER BY "id" LIMIT 11)
)
SELECT 'elnTestNfFeature04', "id", 'undefined', 0, NULL, NULL FROM image_pool WHERE "slot" IN (3, 4, 5, 6, 10, 11);

INSERT INTO "taskImage" ("taskId", "imageId")
SELECT
  CASE "fi"."featureId"
    WHEN 'elnTestRmFeature01' THEN 'elnTestRmTask01'
    WHEN 'elnTestRmFeature02' THEN 'elnTestRmTask02'
    WHEN 'elnTestRmFeature03' THEN 'elnTestRmTask03'
    WHEN 'elnTestRmFeature04' THEN 'elnTestRmTask04'
    WHEN 'elnTestNpFeature01' THEN 'elnTestNpTask01'
    WHEN 'elnTestNpFeature02' THEN 'elnTestNpTask02'
    WHEN 'elnTestNpFeature03' THEN 'elnTestNpTask03'
    WHEN 'elnTestNpFeature04' THEN 'elnTestNpTask04'
    WHEN 'elnTestNfFeature01' THEN 'elnTestNfTask01'
    WHEN 'elnTestNfFeature02' THEN 'elnTestNfTask02'
    WHEN 'elnTestNfFeature03' THEN 'elnTestNfTask03'
    WHEN 'elnTestNfFeature04' THEN 'elnTestNfTask04'
  END,
  "fi"."imageId"
FROM "featureImage" AS "fi"
WHERE "fi"."featureId" IN (
  'elnTestRmFeature01',
  'elnTestRmFeature02',
  'elnTestRmFeature03',
  'elnTestRmFeature04',
  'elnTestNpFeature01',
  'elnTestNpFeature02',
  'elnTestNpFeature03',
  'elnTestNpFeature04',
  'elnTestNfFeature01',
  'elnTestNfFeature02',
  'elnTestNfFeature03',
  'elnTestNfFeature04'
);

COMMIT;
