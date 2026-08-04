-- A durable credential must never belong to an anonymous guest account.
-- The trigger runs in the passkey INSERT transaction, so a successful registration
-- also promotes its owner before Better Auth returns a success response.
CREATE TRIGGER IF NOT EXISTS "passkey_promotes_anonymous_user"
AFTER INSERT ON "passkey"
FOR EACH ROW
WHEN (
  SELECT "isAnonymous"
  FROM "user"
  WHERE "id" = NEW."userId"
) = 1
BEGIN
  UPDATE "user"
  SET "isAnonymous" = 0,
      "updatedAt" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE "id" = NEW."userId";
END;

-- Repair the short-lived invalid state created by the previous two-request flow.
UPDATE "user"
SET "isAnonymous" = 0,
    "updatedAt" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "isAnonymous" = 1
  AND EXISTS (
    SELECT 1
    FROM "passkey"
    WHERE "passkey"."userId" = "user"."id"
  );
