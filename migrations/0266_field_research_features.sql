-- Version zero is the unversioned configuration already in storage.
ALTER TABLE fieldResearchSession ADD COLUMN configurationVersion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fieldResearchSession ADD COLUMN recordSequence INTEGER NOT NULL DEFAULT 0;
UPDATE fieldResearchSession SET recordSequence=(SELECT count(*) FROM fieldResearchRecord WHERE sessionId=fieldResearchSession.id);

-- Historical mobile receipts predate Feature creation and retain their original identity.
ALTER TABLE fieldResearchRecord ADD COLUMN featureId TEXT REFERENCES feature(id);
CREATE UNIQUE INDEX fieldResearchRecord_feature ON fieldResearchRecord(featureId);
CREATE TRIGGER fieldResearchRecord_require_feature BEFORE INSERT ON fieldResearchRecord
WHEN NEW.featureId IS NULL BEGIN SELECT RAISE(ABORT,'A new field research record requires a Feature'); END;
CREATE TRIGGER fieldResearchRecord_keep_feature BEFORE UPDATE OF sessionId,featureId ON fieldResearchRecord
WHEN NEW.sessionId IS NOT OLD.sessionId OR (OLD.featureId IS NOT NULL AND NEW.featureId IS NOT OLD.featureId)
BEGIN SELECT RAISE(ABORT,'A field research record retains its session and Feature'); END;

-- Keep the exact settings and sparse overrides when a schema version is superseded.
CREATE TABLE fieldResearchConfigurationHistory (
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id),
  revision INTEGER NOT NULL,
  schemaVersion INTEGER NOT NULL,
  code TEXT,
  configuration TEXT,
  layers TEXT NOT NULL,
  PRIMARY KEY(sessionId, revision)
);
