INSERT INTO "property" (
  "id",
  "projectId",
  "hubId",
  "scope",
  "type",
  "key",
  "isTranslatable",
  "rank",
  "component",
  "min",
  "max",
  "isUserContributable",
  "isDefaultEnabled",
  "createdAt",
  "modifiedAt"
)
VALUES (
  'gPropMtrEx01',
  NULL,
  (SELECT "id" FROM "hub" WHERE "code" = 'core'),
  'global',
  'classifier',
  'mtrExit',
  true,
  2,
  'SelectField',
  NULL,
  NULL,
  true,
  true,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO "propertyI18n" (
  "propertyId",
  "locale",
  "label",
  "labelGen",
  "placeholder",
  "placeholderGen"
)
VALUES
  ('gPropMtrEx01', 'en', 'Nearest MTR Exit', false, 'Select nearest MTR exit', false),
  ('gPropMtrEx01', 'zh-hans', '最近港铁出口', true, '选择最近港铁出口', true),
  ('gPropMtrEx01', 'zh-hant', '最近港鐵出口', true, '選擇最近港鐵出口', true);

WITH exit_values("id", "rank", "value") AS (
  VALUES
    ('pvmex0000001', 0, 'A'),
    ('pvmex0000002', 1, 'A1'),
    ('pvmex0000003', 2, 'A2'),
    ('pvmex0000004', 3, 'A3'),
    ('pvmex0000005', 4, 'A4'),
    ('pvmex0000006', 5, 'A5'),
    ('pvmex0000007', 6, 'B'),
    ('pvmex0000008', 7, 'B1'),
    ('pvmex0000009', 8, 'B2'),
    ('pvmex0000010', 9, 'B3'),
    ('pvmex0000011', 10, 'B4'),
    ('pvmex0000012', 11, 'B5'),
    ('pvmex0000013', 12, 'B6'),
    ('pvmex0000014', 13, 'C'),
    ('pvmex0000015', 14, 'C1'),
    ('pvmex0000016', 15, 'C2'),
    ('pvmex0000017', 16, 'C3'),
    ('pvmex0000018', 17, 'C4'),
    ('pvmex0000019', 18, 'C5'),
    ('pvmex0000020', 19, 'D'),
    ('pvmex0000021', 20, 'D1'),
    ('pvmex0000022', 21, 'D2'),
    ('pvmex0000023', 22, 'D3'),
    ('pvmex0000024', 23, 'D4'),
    ('pvmex0000025', 24, 'D5'),
    ('pvmex0000026', 25, 'D6'),
    ('pvmex0000027', 26, 'E'),
    ('pvmex0000028', 27, 'E1'),
    ('pvmex0000029', 28, 'E2'),
    ('pvmex0000030', 29, 'E3'),
    ('pvmex0000031', 30, 'E4'),
    ('pvmex0000032', 31, 'E5'),
    ('pvmex0000033', 32, 'F'),
    ('pvmex0000034', 33, 'F1'),
    ('pvmex0000035', 34, 'F2'),
    ('pvmex0000036', 35, 'G'),
    ('pvmex0000037', 36, 'G1'),
    ('pvmex0000038', 37, 'G2'),
    ('pvmex0000039', 38, 'H'),
    ('pvmex0000040', 39, 'J'),
    ('pvmex0000041', 40, 'J1'),
    ('pvmex0000042', 41, 'J2'),
    ('pvmex0000043', 42, 'J3'),
    ('pvmex0000044', 43, 'J4'),
    ('pvmex0000045', 44, 'J5'),
    ('pvmex0000046', 45, 'K'),
    ('pvmex0000047', 46, 'K1'),
    ('pvmex0000048', 47, 'K2'),
    ('pvmex0000049', 48, 'K4'),
    ('pvmex0000050', 49, 'L'),
    ('pvmex0000051', 50, 'L1'),
    ('pvmex0000052', 51, 'L3'),
    ('pvmex0000053', 52, 'L4'),
    ('pvmex0000054', 53, 'L5'),
    ('pvmex0000055', 54, 'L6'),
    ('pvmex0000056', 55, 'N1'),
    ('pvmex0000057', 56, 'N2'),
    ('pvmex0000058', 57, 'N3'),
    ('pvmex0000059', 58, 'N4'),
    ('pvmex0000060', 59, 'N5'),
    ('pvmex0000061', 60, 'P1'),
    ('pvmex0000062', 61, 'P2'),
    ('pvmex0000063', 62, 'P3'),
    ('pvmex0000064', 63, 'R')
)
INSERT INTO "propertyValue" ("id", "propertyId", "rank")
SELECT "id", 'gPropMtrEx01', "rank"
FROM exit_values;

WITH exit_values("id", "value") AS (
  VALUES
    ('pvmex0000001', 'A'),
    ('pvmex0000002', 'A1'),
    ('pvmex0000003', 'A2'),
    ('pvmex0000004', 'A3'),
    ('pvmex0000005', 'A4'),
    ('pvmex0000006', 'A5'),
    ('pvmex0000007', 'B'),
    ('pvmex0000008', 'B1'),
    ('pvmex0000009', 'B2'),
    ('pvmex0000010', 'B3'),
    ('pvmex0000011', 'B4'),
    ('pvmex0000012', 'B5'),
    ('pvmex0000013', 'B6'),
    ('pvmex0000014', 'C'),
    ('pvmex0000015', 'C1'),
    ('pvmex0000016', 'C2'),
    ('pvmex0000017', 'C3'),
    ('pvmex0000018', 'C4'),
    ('pvmex0000019', 'C5'),
    ('pvmex0000020', 'D'),
    ('pvmex0000021', 'D1'),
    ('pvmex0000022', 'D2'),
    ('pvmex0000023', 'D3'),
    ('pvmex0000024', 'D4'),
    ('pvmex0000025', 'D5'),
    ('pvmex0000026', 'D6'),
    ('pvmex0000027', 'E'),
    ('pvmex0000028', 'E1'),
    ('pvmex0000029', 'E2'),
    ('pvmex0000030', 'E3'),
    ('pvmex0000031', 'E4'),
    ('pvmex0000032', 'E5'),
    ('pvmex0000033', 'F'),
    ('pvmex0000034', 'F1'),
    ('pvmex0000035', 'F2'),
    ('pvmex0000036', 'G'),
    ('pvmex0000037', 'G1'),
    ('pvmex0000038', 'G2'),
    ('pvmex0000039', 'H'),
    ('pvmex0000040', 'J'),
    ('pvmex0000041', 'J1'),
    ('pvmex0000042', 'J2'),
    ('pvmex0000043', 'J3'),
    ('pvmex0000044', 'J4'),
    ('pvmex0000045', 'J5'),
    ('pvmex0000046', 'K'),
    ('pvmex0000047', 'K1'),
    ('pvmex0000048', 'K2'),
    ('pvmex0000049', 'K4'),
    ('pvmex0000050', 'L'),
    ('pvmex0000051', 'L1'),
    ('pvmex0000052', 'L3'),
    ('pvmex0000053', 'L4'),
    ('pvmex0000054', 'L5'),
    ('pvmex0000055', 'L6'),
    ('pvmex0000056', 'N1'),
    ('pvmex0000057', 'N2'),
    ('pvmex0000058', 'N3'),
    ('pvmex0000059', 'N4'),
    ('pvmex0000060', 'N5'),
    ('pvmex0000061', 'P1'),
    ('pvmex0000062', 'P2'),
    ('pvmex0000063', 'P3'),
    ('pvmex0000064', 'R')
), locales("locale") AS (
  VALUES ('en'), ('zh-hans'), ('zh-hant')
)
INSERT INTO "propertyValueI18n" (
  "propertyValueId",
  "locale",
  "value",
  "valueGen"
)
SELECT exit_values."id", locales."locale", exit_values."value", false
FROM exit_values
CROSS JOIN locales;

WITH project_existing_ranks AS (
  SELECT "projectId", "rank"
  FROM "property"
  WHERE "scope" = 'project' AND "projectId" IS NOT NULL
  UNION ALL
  SELECT "projectId", "rank"
  FROM "projectProperty"
),
project_max_rank AS (
  SELECT
    "project"."id" AS "projectId",
    COALESCE(MAX(project_existing_ranks."rank"), -1) AS "maxRank"
  FROM "project"
  LEFT JOIN project_existing_ranks
    ON project_existing_ranks."projectId" = "project"."id"
  GROUP BY "project"."id"
)
INSERT INTO "projectProperty" ("projectId", "propertyId", "rank")
SELECT
  project_max_rank."projectId",
  'gPropMtrEx01',
  project_max_rank."maxRank" + 1
FROM project_max_rank
WHERE NOT EXISTS (
  SELECT 1
  FROM "projectProperty"
  WHERE "projectProperty"."projectId" = project_max_rank."projectId"
    AND "projectProperty"."propertyId" = 'gPropMtrEx01'
);
