-- Better Auth 1.7.3 writes providerId/accountId, not issuer. Retain historical
-- issuer values as nullable provenance while preserving every account field.
-- Validate the new identity constraint before replacing the original table.
CREATE UNIQUE INDEX "account_providerId_accountId_uidx"
ON "account" ("providerId", "accountId");

CREATE TABLE "account_v173" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
  "accountId" text NOT NULL,
  "issuer" text,
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

INSERT INTO "account_v173" (
  "id", "userId", "accountId", "issuer", "providerId", "accessToken",
  "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope",
  "idToken", "password", "createdAt", "updatedAt"
)
SELECT "id", "userId", "accountId", "issuer", "providerId", "accessToken",
  "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope",
  "idToken", "password", "createdAt", "updatedAt"
FROM "account";

DROP TABLE "account";
ALTER TABLE "account_v173" RENAME TO "account";
CREATE UNIQUE INDEX "account_providerId_accountId_uidx"
ON "account" ("providerId", "accountId");
