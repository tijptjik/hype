CREATE TABLE messagingPhoneLookup (
  accountId TEXT NOT NULL REFERENCES messagingAccount(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  externalAccountId TEXT NOT NULL,
  telephone TEXT NOT NULL,
  address TEXT,
  reason TEXT,
  checkedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  PRIMARY KEY(accountId, userId)
);
