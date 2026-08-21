-- Better Auth 1.7 identifies an external account by (issuer, accountId).
-- Create and verify the replacement before replacing the live SQLite table so
-- an unsupported provider fails without altering existing account records.
-- A prior failed attempt can leave this staging table behind without touching
-- the original account table, so clear only that disposable table before retrying.
DROP TABLE IF EXISTS "account_new";

CREATE TABLE "account_new" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
  "accountId" text NOT NULL,
  "issuer" text NOT NULL,
  "providerId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "accessTokenExpiresAt" integer,
  "refreshTokenExpiresAt" integer,
  "scope" text,
  "idToken" text,
  "password" text,
  "createdAt" integer NOT NULL,
  "updatedAt" integer NOT NULL
);

-- The CASE expression deliberately has no fallback: a new provider must have
-- its stable issuer mapped explicitly before this migration can complete.
INSERT INTO "account_new" (
  "id",
  "userId",
  "accountId",
  "issuer",
  "providerId",
  "accessToken",
  "refreshToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "scope",
  "idToken",
  "password",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  "accountId",
  CASE "providerId"
    WHEN 'credential' THEN 'local:credential'
    WHEN 'google' THEN 'https://accounts.google.com'
    WHEN 'facebook' THEN 'https://www.facebook.com'
  END,
  "providerId",
  "accessToken",
  "refreshToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "scope",
  "idToken",
  "password",
  "createdAt",
  "updatedAt"
FROM "account";

-- Verify future identity uniqueness before the original table is replaced.
CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
ON "account_new" ("issuer", "accountId");

DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";
