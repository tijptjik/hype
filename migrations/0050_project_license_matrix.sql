PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

ALTER TABLE "project"
ADD COLUMN "license" TEXT NOT NULL DEFAULT '{"meta":{"allMediaSameRights":true,"attribution":"","isAllRightsReserved":false,"isPublicDomain":false},"media":{"all":{"license":"CC BY-SA / ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false},"image":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"text":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"data":{"license":"ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false}}}';

WITH legacy AS (
  SELECT
    p."id" AS "projectId",
    COALESCE(
      (
        SELECT pi."license"
        FROM "projectI18n" pi
        WHERE pi."projectId" = p."id" AND pi."locale" = 'en'
        LIMIT 1
      ),
      (
        SELECT pi."license"
        FROM "projectI18n" pi
        WHERE pi."projectId" = p."id"
        ORDER BY CASE pi."locale"
          WHEN 'en' THEN 0
          WHEN 'zh-hant' THEN 1
          WHEN 'zh-hans' THEN 2
          ELSE 3
        END
        LIMIT 1
      ),
      'CC BY-SA / ODC-ODbL'
    ) AS "legacyLicense",
    lower(
      COALESCE(
        (
          SELECT pi."license"
          FROM "projectI18n" pi
          WHERE pi."projectId" = p."id" AND pi."locale" = 'en'
          LIMIT 1
        ),
        (
          SELECT pi."license"
          FROM "projectI18n" pi
          WHERE pi."projectId" = p."id"
          ORDER BY CASE pi."locale"
            WHEN 'en' THEN 0
            WHEN 'zh-hant' THEN 1
            WHEN 'zh-hans' THEN 2
            ELSE 3
          END
          LIMIT 1
        ),
        'cc by-sa / odc-odbl'
      )
    ) AS "legacyLicenseNormalized",
    COALESCE(
      (
        SELECT pi."attribution"
        FROM "projectI18n" pi
        WHERE pi."projectId" = p."id" AND pi."locale" = 'en'
        LIMIT 1
      ),
      (
        SELECT pi."attribution"
        FROM "projectI18n" pi
        WHERE pi."projectId" = p."id"
        ORDER BY CASE pi."locale"
          WHEN 'en' THEN 0
          WHEN 'zh-hant' THEN 1
          WHEN 'zh-hans' THEN 2
          ELSE 3
        END
        LIMIT 1
      ),
      ''
    ) AS "legacyAttribution"
  FROM "project" p
)
UPDATE "project"
SET "license" = (
  SELECT json_object(
      'meta',
      json_object(
        'allMediaSameRights', json('true'),
        'attribution', legacy."legacyAttribution",
        'isAllRightsReserved', json(CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 'true'
          ELSE 'false'
        END),
        'isPublicDomain', json(CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 'true'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 'true'
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 'true'
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 'true'
          ELSE 'false'
        END)
      ),
      'media',
      json_object(
        'all',
        json_object(
        'license', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 'Copyright'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 'CC0 / PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 'CC0 / PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 'CC0 / PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 'CC0 / PDDL'
          ELSE legacy."legacyLicense"
        END,
        'BY', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%by%' THEN 1
          ELSE 1
        END,
        'SA', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%sa%' THEN 1
          ELSE 1
        END,
        'NC', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nc%' THEN 1
          ELSE 0
        END,
        'ND', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nd%' THEN 1
          ELSE 0
        END
      ),
      'image',
      json_object(
        'license', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 'Copyright'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 'CC0'
          ELSE legacy."legacyLicense"
        END,
        'BY', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%by%' THEN 1
          ELSE 1
        END,
        'SA', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%sa%' THEN 1
          ELSE 1
        END,
        'NC', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nc%' THEN 1
          ELSE 0
        END,
        'ND', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nd%' THEN 1
          ELSE 0
        END
      ),
      'text',
      json_object(
        'license', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 'Copyright'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 'CC0'
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 'CC0'
          ELSE legacy."legacyLicense"
        END,
        'BY', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%by%' THEN 1
          ELSE 1
        END,
        'SA', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%sa%' THEN 1
          ELSE 1
        END,
        'NC', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nc%' THEN 1
          ELSE 0
        END,
        'ND', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nd%' THEN 1
          ELSE 0
        END
      ),
      'data',
      json_object(
        'license', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 'Copyright'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 'PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 'PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 'PDDL'
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 'PDDL'
          ELSE legacy."legacyLicense"
        END,
        'BY', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%by%' THEN 1
          ELSE 1
        END,
        'SA', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN NULL
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%sa%' THEN 1
          ELSE 1
        END,
        'NC', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nc%' THEN 1
          ELSE 0
        END,
        'ND', CASE
          WHEN legacy."legacyLicenseNormalized" LIKE '%copyright%' THEN 1
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%cc-0%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%public domain%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%pddl%' THEN 0
          WHEN legacy."legacyLicenseNormalized" LIKE '%nd%' THEN 1
          ELSE 0
        END
      )
    )
  )
  FROM legacy
  WHERE legacy."projectId" = "project"."id"
);

CREATE TABLE "projectI18n_new" (
  "projectId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameGen" INTEGER NOT NULL DEFAULT 1,
  "nameShort" TEXT NOT NULL,
  "nameShortGen" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "descriptionGen" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("projectId", "locale"),
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade
);

INSERT INTO "projectI18n_new" (
  "projectId",
  "locale",
  "name",
  "nameGen",
  "nameShort",
  "nameShortGen",
  "description",
  "descriptionGen"
)
SELECT
  "projectId",
  "locale",
  "name",
  "nameGen",
  "nameShort",
  "nameShortGen",
  "description",
  "descriptionGen"
FROM "projectI18n";

DROP TABLE "projectI18n";

ALTER TABLE "projectI18n_new" RENAME TO "projectI18n";

COMMIT;

PRAGMA foreign_keys=ON;
