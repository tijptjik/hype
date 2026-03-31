-- Ensure Breadline hub has expected admin role assignments.
-- This is idempotent and safe across environments.

INSERT INTO "hubRole" ("hubId", "userId", "role")
SELECT
  h."id" AS "hubId",
  u."id" AS "userId",
  'admin' AS "role"
FROM "hub" h
JOIN "user" u
  ON u."id" IN (
    'iRgLi3RYOhIYgtM1jyGcZ2U5rGNrKeGa',
    'gH7yxAJ81DVC371yfqKrEalgB8HqQyao'
  )
WHERE lower(h."code") = 'breadline'
ON CONFLICT("hubId", "userId") DO UPDATE SET
  "role" = excluded."role";
