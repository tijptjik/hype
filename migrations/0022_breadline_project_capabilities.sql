UPDATE "project"
SET
  "capabilities" = json(
    '{
      "manageBakeries": true,
      "manageVolunteers": true,
      "manageDropOffs": true
    }'
  ),
  "modifiedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE lower("code") = 'breadline';

INSERT INTO "projectRole" ("projectId", "userId", "role", "capabilities")
SELECT
  p."id" AS "projectId",
  u."id" AS "userId",
  'maintainer' AS "role",
  json('{"manageBakeries":true,"manageVolunteers":true,"manageDropOffs":true}') AS "capabilities"
FROM "project" p
JOIN "user" u
  ON u."id" IN (
    'iRgLi3RYOhIYgtM1jyGcZ2U5rGNrKeGa',
    'gH7yxAJ81DVC371yfqKrEalgB8HqQyao'
  )
WHERE lower(p."code") = 'breadline'
ON CONFLICT("projectId", "userId") DO UPDATE SET
  "role" = excluded."role",
  "capabilities" = excluded."capabilities";
