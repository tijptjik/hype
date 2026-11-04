-- Native archive events use an independent monotonic cursor and supersede local-only flags.
ALTER TABLE messagingAccount ADD COLUMN archiveCursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messagingConversation ADD COLUMN archiveSequence INTEGER NOT NULL DEFAULT 0;
UPDATE messagingConversation SET isArchived = 0;
