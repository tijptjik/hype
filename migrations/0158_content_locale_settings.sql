-- Refs #194: ordered content defaults are separate from Project boolean flags.
-- Missing contentLocales inherits; migration does not persist a user-specific default.
ALTER TABLE organisation ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(settings) AND json_type(settings) = 'object');
ALTER TABLE project ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(settings) AND json_type(settings) = 'object');
