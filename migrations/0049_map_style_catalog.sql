PRAGMA foreign_keys=OFF;

CREATE TABLE "mapStyles_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "code" TEXT NOT NULL,
  "organisationId" TEXT,
  "hubId" TEXT,
  "previewImagePath" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "modifiedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY ("hubId") REFERENCES "hub"("id") ON UPDATE cascade ON DELETE set null
);

CREATE UNIQUE INDEX "mapStyles_code_unique" ON "mapStyles_new" ("code");

CREATE TABLE "mapStyleI18n" (
  "mapStyleId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameGen" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "descriptionGen" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("mapStyleId", "locale"),
  FOREIGN KEY ("mapStyleId") REFERENCES "mapStyles_new"("id") ON UPDATE cascade ON DELETE cascade
);

CREATE TABLE "projectMapStyles_new" (
  "projectId" TEXT NOT NULL,
  "mapStyleId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "modifiedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY ("projectId"),
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY ("mapStyleId") REFERENCES "mapStyles_new"("id") ON UPDATE cascade ON DELETE restrict
);

WITH scope AS (
  SELECT
    (SELECT id FROM "hub" WHERE "code" = 'hkghostsigns' LIMIT 1) AS hkghostsignsHubId,
    (SELECT id FROM "hub" WHERE "code" = 'breadline' LIMIT 1) AS breadlineHubId
),
seed(code) AS (
  VALUES
    ('hyper'),
    ('hyperLight'),
    ('ghostery'),
    ('ghostery-legacy'),
    ('breadline'),
    ('protomaps-light'),
    ('protomaps-dark'),
    ('protomaps-white'),
    ('protomaps-grayscale'),
    ('protomaps-black')
)
INSERT INTO "mapStyles_new" (
  "id",
  "code",
  "organisationId",
  "hubId",
  "previewImagePath",
  "createdAt",
  "modifiedAt"
)
SELECT
  substr(lower(hex(randomblob(16))), 1, 12),
  seed.code,
  NULL,
  CASE
    WHEN seed.code IN ('ghostery', 'ghostery-legacy') THEN scope.hkghostsignsHubId
    WHEN seed.code = 'breadline' THEN scope.breadlineHubId
    ELSE NULL
  END,
  '/mapPreviews/styles/' || seed.code || '.png',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM seed
CROSS JOIN scope;

INSERT INTO "mapStyleI18n" (
  "mapStyleId",
  "locale",
  "name",
  "nameGen",
  "description",
  "descriptionGen"
)
VALUES
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'hyper'), 'en', 'Hyper', 0, 'Default Hype basemap on the official Protomaps dark flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'hyperLight'), 'en', 'Hyper Light', 0, 'Light Hype basemap on the official Protomaps light flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'ghostery'), 'en', 'Ghostery', 0, 'Ghostery basemap rebuilt on top of Protomaps dark tiles.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'ghostery-legacy'), 'en', 'Ghostery Legacy', 0, 'Legacy Hype app basemap with blue roads and Ghostery labels.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'breadline'), 'en', 'Breadline', 0, 'Breadline basemap on the official Protomaps dark flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'protomaps-light'), 'en', 'Protomaps Light', 0, 'Official Protomaps light basemap flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'protomaps-dark'), 'en', 'Protomaps Dark', 0, 'Official Protomaps dark basemap flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'protomaps-white'), 'en', 'Protomaps White', 0, 'Official Protomaps white basemap flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'protomaps-grayscale'), 'en', 'Protomaps Grayscale', 0, 'Official Protomaps grayscale basemap flavor.', 0),
  ((SELECT id FROM "mapStyles_new" WHERE "code" = 'protomaps-black'), 'en', 'Protomaps Black', 0, 'Official Protomaps black basemap flavor.', 0);

INSERT INTO "projectMapStyles_new" (
  "projectId",
  "mapStyleId",
  "createdAt",
  "modifiedAt"
)
SELECT
  legacy."projectId",
  replacement."id",
  legacy."createdAt",
  legacy."modifiedAt"
FROM "projectMapStyles" AS legacy
JOIN "mapStyles" AS previous
  ON previous."key" = legacy."mapStyleKey"
JOIN "mapStyles_new" AS replacement
  ON replacement."code" = CASE
    WHEN previous."key" = 'ghostery' THEN 'ghostery-legacy'
    WHEN previous."key" = 'protomaps' THEN 'hyper'
    ELSE previous."key"
  END;

DROP TABLE "projectMapStyles";
DROP TABLE "mapStyles";

ALTER TABLE "mapStyles_new" RENAME TO "mapStyles";
ALTER TABLE "projectMapStyles_new" RENAME TO "projectMapStyles";

PRAGMA foreign_keys=ON;
