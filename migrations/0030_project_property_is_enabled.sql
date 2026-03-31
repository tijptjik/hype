ALTER TABLE "projectProperty"
ADD COLUMN "isEnabled" integer NOT NULL DEFAULT true;

-- Seed existing rows as enabled.
UPDATE "projectProperty"
SET "isEnabled" = true
WHERE "isEnabled" IS NULL;
