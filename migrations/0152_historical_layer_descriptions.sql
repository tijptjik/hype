-- Refs #194: persist descriptions for the three configured historical layers.
-- Requires historical-layer setup and all three translations; fail rather than silently skip missing rows.
-- Sign removal describes the sign, not the operating status of its former business.
CREATE TABLE _historical_layer_description_copy (
  layerId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  locale TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (layerId, locale)
);
INSERT INTO _historical_layer_description_copy VALUES
('history:7akti7OImSFg', 'YuSFnia9VOtG', 'en', 'Hong Kong ghost signs that are no longer in place.'),
('history:7akti7OImSFg', 'YuSFnia9VOtG', 'zh-hant', '記錄香港已不復存在的舊商店招牌。'),
('history:7akti7OImSFg', 'YuSFnia9VOtG', 'zh-hans', '记录香港已不复存在的旧商店招牌。'),
('history:RfWMLs_jW6QJ', '-z26MuNRTJwi', 'en', 'Hong Kong independent bookshops that have permanently closed.'),
('history:RfWMLs_jW6QJ', '-z26MuNRTJwi', 'zh-hant', '記錄香港已永久結業的獨立書店。'),
('history:RfWMLs_jW6QJ', '-z26MuNRTJwi', 'zh-hans', '记录香港已永久结业的独立书店。'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'en', 'Hong Kong neon signs that have been removed.'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'zh-hant', '記錄香港已被拆卸的霓虹招牌。'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'zh-hans', '记录香港已被拆卸的霓虹招牌。');

CREATE TABLE _historical_layer_description_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _historical_layer_description_guard
SELECT count(*) = 9
FROM _historical_layer_description_copy c
JOIN layer l ON l.id = c.layerId AND l.projectId = c.projectId AND l.historicalSourceLayerId IS NOT NULL
JOIN layerI18n i ON i.layerId = c.layerId AND i.locale = c.locale;

UPDATE layerI18n
SET description = (
  SELECT c.description FROM _historical_layer_description_copy c
  WHERE c.layerId = layerI18n.layerId AND c.locale = layerI18n.locale
), descriptionGen = 0
WHERE EXISTS (
  SELECT 1 FROM _historical_layer_description_copy c
  JOIN layer l ON l.id = c.layerId AND l.projectId = c.projectId AND l.historicalSourceLayerId IS NOT NULL
  WHERE c.layerId = layerI18n.layerId AND c.locale = layerI18n.locale
);

DROP TABLE _historical_layer_description_guard;
DROP TABLE _historical_layer_description_copy;
