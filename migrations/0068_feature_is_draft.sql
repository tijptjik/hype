-- Hide provisional contributed features until the submission flow is finalized.

ALTER TABLE feature ADD COLUMN isDraft integer DEFAULT 0 NOT NULL;
