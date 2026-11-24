CREATE TABLE fieldResearchRecord (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id)
);
CREATE INDEX fieldResearchRecord_session ON fieldResearchRecord(sessionId);

-- A capture and its session activity timestamp commit together, including on device retries.
CREATE TRIGGER fieldResearchRecord_created AFTER INSERT ON fieldResearchRecord
BEGIN
  UPDATE fieldResearchSession SET updatedAt=max(updatedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id=NEW.sessionId;
END;
