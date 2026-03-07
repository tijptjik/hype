-- Custom SQL migration file, put your code below! --
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
VALUES
  (
    (SELECT "id" FROM "project" WHERE lower("code") = 'breadline'),
    'iRgLi3RYOhIYgtM1jyGcZ2U5rGNrKeGa',
    'maintainer',
    json('{"manageBakeries":true,"manageVolunteers":true,"manageDropOffs":true}')
  ),
  (
    (SELECT "id" FROM "project" WHERE lower("code") = 'breadline'),
    'gH7yxAJ81DVC371yfqKrEalgB8HqQyao',
    'maintainer',
    json('{"manageBakeries":true,"manageVolunteers":true,"manageDropOffs":true}')
  )
ON CONFLICT("projectId", "userId") DO UPDATE SET
  "role" = excluded."role",
  "capabilities" = excluded."capabilities";
