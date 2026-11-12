-- Archive visibility is independent of upload and completion progress.
ALTER TABLE fieldResearchSession ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fieldResearchSession ADD COLUMN archivedAt TEXT;
ALTER TABLE fieldResearchSession ADD COLUMN archivedBy TEXT REFERENCES user(id);
CREATE INDEX field_research_session_archive ON fieldResearchSession(isArchived, createdAt, id);
