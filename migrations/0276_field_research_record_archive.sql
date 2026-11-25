ALTER TABLE fieldResearchRecord ADD COLUMN archivedAt TEXT;
ALTER TABLE fieldResearchRecord ADD COLUMN archivedBy TEXT;
CREATE INDEX fieldResearchRecord_session_archive ON fieldResearchRecord(sessionId, archivedAt);

-- Retain only the device retry key when a capture is permanently deleted.
CREATE TABLE fieldResearchDeletedRecord (id TEXT PRIMARY KEY NOT NULL);
CREATE TRIGGER fieldResearchRecord_deleted AFTER DELETE ON fieldResearchRecord
BEGIN INSERT INTO fieldResearchDeletedRecord(id) VALUES(OLD.id); END;
CREATE TRIGGER fieldResearchRecord_reject_replay BEFORE INSERT ON fieldResearchRecord
WHEN EXISTS(SELECT 1 FROM fieldResearchDeletedRecord WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'This field record was deleted'); END;
