-- Provider existence is separate from verified identity ownership.
ALTER TABLE userMessagingIdentity ADD COLUMN validation TEXT;
CREATE TABLE accountProviderProfile (
  providerId TEXT NOT NULL,
  accountId TEXT NOT NULL,
  email TEXT,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (providerId, accountId)
);
-- Any writer changing a claim invalidates its previously observed existence.
CREATE TRIGGER user_messaging_validation_revision AFTER UPDATE ON userMessagingIdentity
WHEN NEW.updatedAt != OLD.updatedAt OR NEW.phoneNumber IS NOT OLD.phoneNumber
  OR NEW.username IS NOT OLD.username OR NEW.nativeId IS NOT OLD.nativeId
BEGIN
  UPDATE userMessagingIdentity SET validation = NULL
  WHERE userId = NEW.userId AND platform = NEW.platform;
END;
