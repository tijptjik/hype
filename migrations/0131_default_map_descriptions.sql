-- Concise default-map descriptions in every supported locale, including the next ELN edition.
-- Match exact layer/project identities and require all translations before changing copy.
-- Preserve names, publication state and presentation timestamps used to order ELN editions.
CREATE TABLE _default_map_description_copy (
  layerId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  locale TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (layerId, locale)
);
INSERT INTO _default_map_description_copy VALUES
('lvWu_dCwiVZt', 'vGBvWfSZNELM', 'en', 'European literature readings across Hong Kong for the first European Literature Night in 2024.'),
('lvWu_dCwiVZt', 'vGBvWfSZNELM', 'zh-hant', '2024年首屆歐洲文學之夜，於香港各處舉行歐洲文學作品朗讀活動。'),
('lvWu_dCwiVZt', 'vGBvWfSZNELM', 'zh-hans', '2024年首届欧洲文学之夜，于香港各处举行欧洲文学作品朗读活动。'),
('0bf1RYWdpaAt', 'vGBvWfSZNELM', 'en', 'European literature readings across Hong Kong for the second European Literature Night in 2025.'),
('0bf1RYWdpaAt', 'vGBvWfSZNELM', 'zh-hant', '2025年第二屆歐洲文學之夜，於香港各處舉行歐洲文學作品朗讀活動。'),
('0bf1RYWdpaAt', 'vGBvWfSZNELM', 'zh-hans', '2025年第二届欧洲文学之夜，于香港各处举行欧洲文学作品朗读活动。'),
('vli8hfmD-XEZ', 'vGBvWfSZNELM', 'en', 'European literature readings across Hong Kong for the third European Literature Night in 2026.'),
('vli8hfmD-XEZ', 'vGBvWfSZNELM', 'zh-hant', '2026年第三屆歐洲文學之夜，於香港各處舉行歐洲文學作品朗讀活動。'),
('vli8hfmD-XEZ', 'vGBvWfSZNELM', 'zh-hans', '2026年第三届欧洲文学之夜，于香港各处举行欧洲文学作品朗读活动。'),
('zJJawV9ay56p', 'vGBvWfSZNELM', 'en', 'European literature readings across Hong Kong for the fourth European Literature Night in 2027.'),
('zJJawV9ay56p', 'vGBvWfSZNELM', 'zh-hant', '2027年第四屆歐洲文學之夜，於香港各處舉行歐洲文學作品朗讀活動。'),
('zJJawV9ay56p', 'vGBvWfSZNELM', 'zh-hans', '2027年第四届欧洲文学之夜，于香港各处举行欧洲文学作品朗读活动。'),
('7akti7OImSFg', 'YuSFnia9VOtG', 'en', 'Traces of old Hong Kong businesses, recorded through their surviving signs.'),
('7akti7OImSFg', 'YuSFnia9VOtG', 'zh-hant', '透過留存的舊招牌，記錄香港昔日商店的痕跡。'),
('7akti7OImSFg', 'YuSFnia9VOtG', 'zh-hans', '通过留存的旧招牌，记录香港昔日商店的痕迹。'),
('RfWMLs_jW6QJ', '-z26MuNRTJwi', 'en', 'Independent bookshops across Hong Kong, from neighbourhood shops to specialist collections.'),
('RfWMLs_jW6QJ', '-z26MuNRTJwi', 'zh-hant', '香港各區的獨立書店，從社區小店到專門書店。'),
('RfWMLs_jW6QJ', '-z26MuNRTJwi', 'zh-hans', '香港各区的独立书店，从社区小店到专门书店。'),
('lMsnrDxWhJss', 'EovGYWS-GSon', 'en', 'Neon signs still in place across Hong Kong.'),
('lMsnrDxWhJss', 'EovGYWS-GSon', 'zh-hant', '香港各區仍然留存的霓虹招牌。'),
('lMsnrDxWhJss', 'EovGYWS-GSon', 'zh-hans', '香港各区仍然留存的霓虹招牌。'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'en', 'A record of Hong Kong neon signs that have been removed.'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'zh-hant', '記錄香港已被拆卸的霓虹招牌。'),
('opQQLGHoFwkE', 'EovGYWS-GSon', 'zh-hans', '记录香港已被拆卸的霓虹招牌。');

CREATE TABLE _default_map_description_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _default_map_description_guard
SELECT count(*) = 24
FROM _default_map_description_copy c
JOIN layer l ON l.id = c.layerId AND l.projectId = c.projectId
JOIN layerI18n i ON i.layerId = c.layerId AND i.locale = c.locale;

UPDATE layerI18n
SET description = (
  SELECT c.description FROM _default_map_description_copy c
  WHERE c.layerId = layerI18n.layerId AND c.locale = layerI18n.locale
), descriptionGen = 0
WHERE EXISTS (
  SELECT 1 FROM _default_map_description_copy c
  JOIN layer l ON l.id = c.layerId AND l.projectId = c.projectId
  WHERE c.layerId = layerI18n.layerId AND c.locale = layerI18n.locale
);

DROP TABLE _default_map_description_guard;
DROP TABLE _default_map_description_copy;
