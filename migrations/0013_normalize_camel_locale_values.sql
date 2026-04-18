-- Normalize accidentally persisted camelCase locale values to ISO keys.
-- This migration is intentionally strict: data should be stored with BCP47 tags.

-- organisationI18n
DELETE FROM organisationI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM organisationI18n t2
    WHERE t2.organisationId = organisationI18n.organisationId
      AND t2.locale = CASE organisationI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE organisationI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- projectI18n
DELETE FROM projectI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM projectI18n t2
    WHERE t2.projectId = projectI18n.projectId
      AND t2.locale = CASE projectI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE projectI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- hubI18n
DELETE FROM hubI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM hubI18n t2
    WHERE t2.hubId = hubI18n.hubId
      AND t2.locale = CASE hubI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE hubI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- layerI18n
DELETE FROM layerI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM layerI18n t2
    WHERE t2.layerId = layerI18n.layerId
      AND t2.locale = CASE layerI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE layerI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- featureI18n
DELETE FROM featureI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM featureI18n t2
    WHERE t2.featureId = featureI18n.featureId
      AND t2.locale = CASE featureI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE featureI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- featurePropertyI18n
DELETE FROM featurePropertyI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM featurePropertyI18n t2
    WHERE t2.featureId = featurePropertyI18n.featureId
      AND t2.propertyId = featurePropertyI18n.propertyId
      AND t2.locale = CASE featurePropertyI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE featurePropertyI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- propertyI18n
DELETE FROM propertyI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM propertyI18n t2
    WHERE t2.propertyId = propertyI18n.propertyId
      AND t2.locale = CASE propertyI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE propertyI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- propertyValueI18n
DELETE FROM propertyValueI18n
WHERE locale IN ('zhHans', 'zhHant')
  AND EXISTS (
    SELECT 1
    FROM propertyValueI18n t2
    WHERE t2.propertyValueId = propertyValueI18n.propertyValueId
      AND t2.locale = CASE propertyValueI18n.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  );
UPDATE propertyValueI18n
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');

-- user locale preference
UPDATE user
SET locale = CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE locale END
WHERE locale IN ('zhHans', 'zhHant');
