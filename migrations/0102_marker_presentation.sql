-- Refs #199. Public marker presentation is independent of the basemap.
-- Null preserves current user preference. Existing layers inherit unless their
-- validated metadata.markerStyleCode explicitly selects a registered renderer.
ALTER TABLE project ADD COLUMN markerStyleCode TEXT
  CHECK (markerStyleCode IS NULL OR markerStyleCode IN ('image','dot','pin','flag','breadline'));
