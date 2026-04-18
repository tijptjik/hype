-- Add a draft lifecycle flag so task IDs can be minted before submission is finalized.

ALTER TABLE task ADD COLUMN isDraft integer DEFAULT 1 NOT NULL;

-- Existing tasks are already finalized submissions and should not be treated as drafts.
UPDATE task
SET isDraft = 0;
