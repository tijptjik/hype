-- Organisation messaging is additive. Existing personal WhatsApp sessions are not reassigned.
CREATE TABLE messagingAccount (
 id TEXT PRIMARY KEY NOT NULL,
 organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('whatsapp','telegram')),
 bridgeAccountId TEXT NOT NULL UNIQUE,
 externalAccountId TEXT,
 displayName TEXT,
 enabled INTEGER NOT NULL DEFAULT 0,
 inboxCursor INTEGER NOT NULL DEFAULT 0,
 registeredBy TEXT REFERENCES user(id) ON DELETE SET NULL,
 createdAt INTEGER NOT NULL,
 updatedAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX messaging_account_org_platform ON messagingAccount(organisationId,platform);
CREATE UNIQUE INDEX messaging_account_external ON messagingAccount(platform,externalAccountId);
CREATE TABLE userMessagingPreference (
 userId TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 platform TEXT CHECK(platform IS NULL OR platform IN ('whatsapp','telegram')),
 updatedAt INTEGER NOT NULL
);
CREATE TABLE userMessagingIdentity (
 userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('whatsapp','telegram')),
 address TEXT NOT NULL,
 verifiedAt INTEGER,
 verifiedBy TEXT REFERENCES user(id) ON DELETE SET NULL,
 updatedAt INTEGER NOT NULL,
 PRIMARY KEY(userId,platform)
);
CREATE UNIQUE INDEX messaging_identity_address ON userMessagingIdentity(platform,address);
CREATE TABLE messagingConversation (
 id TEXT PRIMARY KEY NOT NULL,
 accountId TEXT NOT NULL REFERENCES messagingAccount(id) ON DELETE CASCADE,
 chatId TEXT NOT NULL,
 recipientUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
 displayName TEXT,
 lastMessageAt INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX messaging_conversation_native ON messagingConversation(accountId,chatId);
CREATE INDEX messaging_conversation_recipient ON messagingConversation(recipientUserId);
CREATE TABLE messagingMessage (
 accountId TEXT NOT NULL REFERENCES messagingAccount(id) ON DELETE CASCADE,
 chatId TEXT NOT NULL,
 messageId TEXT NOT NULL,
 senderId TEXT NOT NULL,
 sourceSequence INTEGER NOT NULL,
 timestamp INTEGER NOT NULL,
 payload TEXT NOT NULL,
 PRIMARY KEY(accountId,chatId,messageId,senderId)
);
CREATE INDEX messaging_message_history ON messagingMessage(accountId,chatId,timestamp);
CREATE TABLE messagingSend (
 accountId TEXT NOT NULL REFERENCES messagingAccount(id) ON DELETE CASCADE,
 requestId TEXT NOT NULL,
 actorUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
 recipientUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
 request TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','submitted','uncertain')),
 messageId TEXT NOT NULL DEFAULT '',
 createdAt INTEGER NOT NULL,
 updatedAt INTEGER NOT NULL,
 PRIMARY KEY(accountId,requestId)
);
CREATE INDEX messaging_send_recent ON messagingSend(accountId,createdAt);
