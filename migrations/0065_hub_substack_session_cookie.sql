ALTER TABLE `hub`
ADD `subscriptionSessionCookie` text;

UPDATE `hub`
SET `subscriptionSessionCookie` = `subscriptionConnectSid`
WHERE `subscriptionConnectSid` IS NOT NULL
  AND trim(`subscriptionConnectSid`) <> '';

ALTER TABLE `hub`
DROP COLUMN `subscriptionConnectSid`;
