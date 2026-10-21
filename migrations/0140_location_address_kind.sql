-- Refs #194: extend the inline kind constraint without rebuilding the lifecycle store.
-- Keep identities, foreign keys, history and triggers in place throughout this migration.
ALTER TABLE location ADD COLUMN nextKind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (nextKind IN ('unknown','establishment','building','address','natural'));
UPDATE location SET nextKind=kind;
ALTER TABLE location DROP COLUMN kind;
ALTER TABLE location RENAME COLUMN nextKind TO kind;
