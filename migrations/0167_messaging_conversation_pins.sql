-- Pins belong to the shared account inbox and never change the native conversation route.
ALTER TABLE messagingConversation ADD COLUMN pinnedAt INTEGER;
CREATE INDEX messaging_conversation_pins
  ON messagingConversation(accountId, isArchived, pinnedAt DESC, lastMessageAt DESC, id);
