CREATE TABLE IF NOT EXISTS "hubLayer" (
  "hubId" text NOT NULL REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "layerId" text NOT NULL REFERENCES "layer"("id") ON UPDATE cascade ON DELETE cascade,
  "isDefaultVisible" integer DEFAULT false NOT NULL,
  PRIMARY KEY("hubId", "layerId")
);

INSERT INTO "hubLayer" ("hubId", "layerId", "isDefaultVisible")
SELECT h.id, l.id, l."isDefaultVisible"
FROM "layer" l
INNER JOIN "organisation" o ON o.id = l."organisationId"
INNER JOIN "hub" h ON h.id = o."hubId"
ON CONFLICT("hubId", "layerId") DO UPDATE SET
  "isDefaultVisible" = excluded."isDefaultVisible";

INSERT INTO "hubLayer" ("hubId", "layerId", "isDefaultVisible")
SELECT core.id, l.id, l."isDefaultVisible"
FROM "layer" l
INNER JOIN "organisation" o ON o.id = l."organisationId"
INNER JOIN "hub" core ON core."code" = 'core'
WHERE o."hubId" IS NULL OR o."isHubExclusive" = false
ON CONFLICT("hubId", "layerId") DO UPDATE SET
  "isDefaultVisible" = excluded."isDefaultVisible";

CREATE TABLE "__new_userLayer" (
  "layerId" text NOT NULL REFERENCES "layer"("id") ON UPDATE cascade ON DELETE cascade,
  "userId" text NOT NULL REFERENCES "user"("id") ON UPDATE cascade ON DELETE cascade,
  "hubId" text NOT NULL REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "isDefaultVisible" integer DEFAULT false NOT NULL,
  PRIMARY KEY("layerId", "userId", "hubId")
);

INSERT INTO "__new_userLayer" ("layerId", "userId", "hubId", "isDefaultVisible")
SELECT ul."layerId", ul."userId", core.id, ul."isVisibleOnLoad"
FROM "userLayer" ul
INNER JOIN "hub" core ON core."code" = 'core';

DROP TABLE "userLayer";
ALTER TABLE "__new_userLayer" RENAME TO "userLayer";
