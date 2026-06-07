-- Default the hkghostsigns project to the Ghostery map style when both rows exist.

INSERT INTO "projectMapStyles" (
  "projectId",
  "mapStyleId",
  "createdAt",
  "modifiedAt"
)
SELECT
  project_scope."projectId",
  visible_style."mapStyleId",
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT
    p."id" AS "projectId",
    o."id" AS "organisationId",
    o."hubId" AS "hubId"
  FROM "project" AS p
  INNER JOIN "organisation" AS o
    ON o."id" = p."organisationId"
  WHERE p."code" = 'hkghostsigns'
  LIMIT 1
) AS project_scope
INNER JOIN (
  SELECT
    ms."id" AS "mapStyleId",
    ms."organisationId",
    ms."hubId"
  FROM "mapStyles" AS ms
  WHERE ms."code" = 'ghostery'
) AS visible_style
  ON (
    visible_style."organisationId" IS NULL OR
    visible_style."organisationId" = project_scope."organisationId"
  )
  AND (
    visible_style."hubId" IS NULL OR
    visible_style."hubId" = project_scope."hubId"
  )
ON CONFLICT("projectId") DO UPDATE SET
  "mapStyleId" = excluded."mapStyleId",
  "modifiedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
