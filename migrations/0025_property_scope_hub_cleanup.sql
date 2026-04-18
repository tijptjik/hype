-- Normalize legacy property scope naming.
-- Canonical scope is now `hub` (not `global`).
UPDATE "property"
SET "scope" = 'hub'
WHERE "scope" = 'global';
