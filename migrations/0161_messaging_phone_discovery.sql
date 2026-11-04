-- Tie automatic provider discovery to the current HYPE profile phone.
ALTER TABLE userMessagingIdentity ADD COLUMN sourceTelephone TEXT;
