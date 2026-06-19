-- Normalize map-style i18n rows accidentally persisted with form locale keys.
-- The DB stores BCP47 locale tags while API response objects use camelCase keys.

DELETE FROM "mapStyleI18n"
WHERE "locale" IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM "mapStyleI18n" AS canonical
    WHERE canonical."mapStyleId" = "mapStyleI18n"."mapStyleId"
      AND canonical."locale" = CASE "mapStyleI18n"."locale"
        WHEN 'zhHans' THEN 'zh-hans'
        WHEN 'zhHant' THEN 'zh-hant'
      END
  );

UPDATE "mapStyleI18n"
SET "locale" = CASE "locale"
  WHEN 'zhHans' THEN 'zh-hans'
  WHEN 'zhHant' THEN 'zh-hant'
  ELSE "locale"
END
WHERE "locale" IN ('zhHans', 'zhHant');
