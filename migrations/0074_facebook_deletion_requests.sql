CREATE TABLE IF NOT EXISTS "facebookDeletionRequest" (
  "confirmationCodeHash" text PRIMARY KEY NOT NULL,
  "completedAt" integer NOT NULL
);
