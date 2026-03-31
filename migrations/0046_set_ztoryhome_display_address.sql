INSERT INTO "featureI18n" (
  "featureId",
  "locale",
  "title",
  "titleGen",
  "description",
  "descriptionGen",
  "displayAddress",
  "displayAddressGen",
  "addressProperties"
)
SELECT
  'ALusUDEafJEM',
  'en',
  COALESCE(existing."title", ''),
  COALESCE(existing."titleGen", 0),
  existing."description",
  COALESCE(existing."descriptionGen", 0),
  'ztoryhome, 118 Queen''s Road West, Sai Ying Pun',
  0,
  existing."addressProperties"
FROM (
  SELECT 1
) AS seed
LEFT JOIN "featureI18n" AS existing
  ON existing."featureId" = 'ALusUDEafJEM'
  AND existing."locale" = 'en'
ON CONFLICT("featureId", "locale") DO UPDATE SET
  "displayAddress" = excluded."displayAddress",
  "displayAddressGen" = excluded."displayAddressGen";
