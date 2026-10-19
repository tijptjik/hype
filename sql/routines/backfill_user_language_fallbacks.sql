-- Enable English and Traditional Chinese for every existing user, including guests.
-- Preserve all other preferences and existing fallbacks (including Simplified Chinese).
-- Only update rows that need a change; reruns leave current rows untouched.
UPDATE user
SET preferences = json_set(
  preferences,
  '$.fallbackLocales',
  json((
    SELECT json_group_array(locale)
    FROM (
      SELECT DISTINCT CASE value
        WHEN 'zhHant' THEN 'zh-hant'
        WHEN 'zhHans' THEN 'zh-hans'
        ELSE value
      END AS locale
      FROM json_each(
        CASE WHEN json_type(preferences, '$.fallbackLocales') = 'array'
          THEN json_extract(preferences, '$.fallbackLocales') ELSE '[]' END
      )
      UNION SELECT 'en'
      UNION SELECT 'zh-hant'
    )
  ))
)
WHERE json_valid(preferences)
  AND json_type(preferences) = 'object'
  AND (
    json_type(preferences, '$.fallbackLocales') IS NOT 'array'
    OR NOT EXISTS (SELECT 1 FROM json_each(preferences, '$.fallbackLocales') WHERE value = 'en')
    OR NOT EXISTS (SELECT 1 FROM json_each(preferences, '$.fallbackLocales') WHERE value = 'zh-hant')
    OR EXISTS (SELECT 1 FROM json_each(preferences, '$.fallbackLocales') WHERE value IN ('zhHant', 'zhHans'))
  );
