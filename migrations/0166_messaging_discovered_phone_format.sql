-- Normalize only the legacy profile-phone backfill from 0165. Preserve independently edited
-- messaging numbers, verification, timestamps, and the exact sourceTelephone provenance.
WITH discovered AS (
  SELECT userId, platform,
    replace(replace(replace(replace(sourceTelephone, ' ', ''), '(', ''), ')', ''), '-', '') AS legacyPhone,
    replace(replace(replace(replace(replace(replace(sourceTelephone,
      ' ', ''), '(', ''), ')', ''), '-', ''), '.', ''), char(9), '') AS compactPhone
  FROM userMessagingIdentity WHERE sourceTelephone IS NOT NULL
), normalized AS (
  SELECT userId, platform, legacyPhone,
    CASE
      WHEN length(compactPhone) BETWEEN 8 AND 16 AND compactPhone GLOB '+[1-9]*'
        AND substr(compactPhone, 2) NOT GLOB '*[^0-9]*' THEN compactPhone
      WHEN length(compactPhone) BETWEEN 9 AND 17 AND compactPhone GLOB '00[1-9]*'
        AND compactPhone NOT GLOB '*[^0-9]*' THEN '+' || substr(compactPhone, 3)
      WHEN length(compactPhone) = 8 AND compactPhone NOT GLOB '*[^0-9]*' THEN '+852' || compactPhone
      WHEN length(compactPhone) = 11 AND compactPhone LIKE '852%'
        AND compactPhone NOT GLOB '*[^0-9]*' THEN '+' || compactPhone
      ELSE NULL
    END AS normalizedPhone
  FROM discovered
)
UPDATE userMessagingIdentity
SET phoneNumber = (
  SELECT normalizedPhone FROM normalized
  WHERE normalized.userId = userMessagingIdentity.userId
    AND normalized.platform = userMessagingIdentity.platform
)
WHERE EXISTS (
  SELECT 1 FROM normalized
  WHERE normalized.userId = userMessagingIdentity.userId
    AND normalized.platform = userMessagingIdentity.platform
    AND userMessagingIdentity.phoneNumber IS normalized.legacyPhone
    AND userMessagingIdentity.phoneNumber IS NOT normalized.normalizedPhone
);
