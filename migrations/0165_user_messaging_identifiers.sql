-- The preferred delivery platform is a user-wide scalar, independent of provider identities.
ALTER TABLE user ADD COLUMN preferredMessagingPlatform TEXT
  CHECK(preferredMessagingPlatform IS NULL OR preferredMessagingPlatform IN ('whatsapp','telegram'));
UPDATE user
SET preferredMessagingPlatform = (SELECT platform FROM userMessagingPreference WHERE userId = user.id),
    updatedAt = max(updatedAt, (SELECT updatedAt FROM userMessagingPreference WHERE userId = user.id))
WHERE EXISTS (SELECT 1 FROM userMessagingPreference WHERE userId = user.id);
DROP TABLE userMessagingPreference;

-- Separate mutable contact identifiers from the provider ID; never rewrite existing thread IDs.
CREATE TABLE userMessagingIdentity_next (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('whatsapp','telegram')),
  phoneNumber TEXT,
  username TEXT,
  nativeId TEXT,
  sourceTelephone TEXT,
  verifiedAt INTEGER,
  verifiedBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId,platform),
  CHECK(phoneNumber IS NOT NULL OR username IS NOT NULL OR nativeId IS NOT NULL),
  CHECK(verifiedAt IS NULL OR nativeId IS NOT NULL)
);
INSERT INTO userMessagingIdentity_next
  (userId,platform,phoneNumber,username,nativeId,sourceTelephone,verifiedAt,verifiedBy,updatedAt)
SELECT userId, platform,
  CASE
    WHEN address LIKE '+%' THEN address
    WHEN platform = 'whatsapp' AND address LIKE '%@s.whatsapp.net'
      THEN '+' || substr(address, 1, instr(address, '@') - 1)
    WHEN sourceTelephone IS NOT NULL
      THEN replace(replace(replace(replace(sourceTelephone, ' ', ''), '(', ''), ')', ''), '-', '')
    ELSE NULL
  END,
  CASE WHEN platform = 'telegram' AND address LIKE '@%' THEN lower(substr(address, 2)) ELSE NULL END,
  CASE
    WHEN platform = 'whatsapp' AND (address LIKE '%@s.whatsapp.net' OR address LIKE '%@lid') THEN address
    WHEN platform = 'telegram' AND length(address) > 0 AND address NOT GLOB '*[^0-9]*' THEN address
    ELSE NULL
  END,
  sourceTelephone, verifiedAt, verifiedBy, updatedAt
FROM userMessagingIdentity;
DROP TABLE userMessagingIdentity;
ALTER TABLE userMessagingIdentity_next RENAME TO userMessagingIdentity;
CREATE UNIQUE INDEX messaging_identity_native_id ON userMessagingIdentity(platform,nativeId);

-- Provider aliases must never associate the same native address with different HYPE users.
CREATE TABLE userMessagingIdentityAlias (
  userId TEXT NOT NULL,
  platform TEXT NOT NULL,
  nativeId TEXT NOT NULL,
  PRIMARY KEY(platform,nativeId),
  FOREIGN KEY(userId,platform) REFERENCES userMessagingIdentity(userId,platform) ON DELETE CASCADE
);
CREATE INDEX messaging_identity_alias_user ON userMessagingIdentityAlias(userId,platform);
INSERT INTO userMessagingIdentityAlias(userId,platform,nativeId)
SELECT userId,platform,nativeId FROM userMessagingIdentity WHERE verifiedAt IS NOT NULL;

-- Keep canonical claims atomic with verification, including automatic profile-phone discovery.
CREATE TRIGGER messaging_identity_verified_insert
AFTER INSERT ON userMessagingIdentity WHEN NEW.verifiedAt IS NOT NULL
BEGIN
  INSERT INTO userMessagingIdentityAlias(userId,platform,nativeId)
  VALUES(NEW.userId,NEW.platform,NEW.nativeId);
END;
CREATE TRIGGER messaging_identity_verified_update
AFTER UPDATE OF nativeId,verifiedAt ON userMessagingIdentity
BEGIN
  DELETE FROM userMessagingIdentityAlias
  WHERE userId = NEW.userId AND platform = NEW.platform
    AND (NEW.verifiedAt IS NULL OR OLD.nativeId IS NOT NEW.nativeId OR OLD.verifiedAt IS NOT NEW.verifiedAt);
  INSERT INTO userMessagingIdentityAlias(userId,platform,nativeId)
  SELECT NEW.userId,NEW.platform,NEW.nativeId
  WHERE NEW.verifiedAt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM userMessagingIdentityAlias
    WHERE userId = NEW.userId AND platform = NEW.platform AND nativeId = NEW.nativeId
  );
END;
