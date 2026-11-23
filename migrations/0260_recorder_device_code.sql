CREATE TABLE deviceCode (
  id TEXT PRIMARY KEY NOT NULL,
  deviceCode TEXT NOT NULL UNIQUE,
  userCode TEXT NOT NULL UNIQUE,
  userId TEXT,
  expiresAt INTEGER NOT NULL,
  status TEXT NOT NULL,
  lastPolledAt INTEGER,
  pollingInterval INTEGER,
  clientId TEXT,
  scope TEXT
);
