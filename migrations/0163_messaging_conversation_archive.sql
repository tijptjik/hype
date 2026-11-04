-- Archiving is shared within the organisation's Hype inbox and never deletes messages.
ALTER TABLE messagingConversation ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0 CHECK (isArchived IN (0, 1));
CREATE INDEX messaging_conversation_archive ON messagingConversation(accountId, isArchived, lastMessageAt);
