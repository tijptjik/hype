-- Configuration belongs to the session; legacy sessions remain readable without it.
ALTER TABLE fieldResearchSession ADD COLUMN code TEXT;
ALTER TABLE fieldResearchSession ADD COLUMN configuration TEXT;

-- A session may configure multiple layers from its project, with at most one default.
CREATE TABLE fieldResearchSessionLayer (
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id),
  layerId TEXT NOT NULL REFERENCES layer(id),
  isDefault INTEGER NOT NULL DEFAULT 0 CHECK (isDefault IN (0, 1)),
  overrides TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (sessionId, layerId)
);
CREATE UNIQUE INDEX fieldResearchSessionLayer_default
  ON fieldResearchSessionLayer(sessionId) WHERE isDefault = 1;

-- Preserve the destination of pre-existing single-layer sessions.
INSERT INTO fieldResearchSessionLayer(sessionId, layerId, isDefault)
SELECT id, layerId, 1 FROM fieldResearchSession WHERE layerId IS NOT NULL;
