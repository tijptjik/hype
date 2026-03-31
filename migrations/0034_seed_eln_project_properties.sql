PRAGMA foreign_keys=ON;

-- Seed ELN project-scoped properties and their related i18n/value records.

INSERT OR IGNORE INTO "property" (
  "id",
  "projectId",
  "scope",
  "type",
  "key",
  "component",
  "isTranslatable",
  "isUserContributable",
  "isDefaultEnabled"
)
VALUES
  ('j608565AMXfN', 'vGBvWfSZNELM', 'project', 'classifier', 'country', 'SelectField', 1, 1, 1),
  ('ZkXV20T2Bsa7', 'vGBvWfSZNELM', 'project', 'specifier', 'synopsis', 'TextareaField', 1, 1, 1),
  ('PLifDO417BbU', 'vGBvWfSZNELM', 'project', 'specifier', 'author', 'InputField', 0, 1, 1),
  ('w7L3$qPA41ij', 'vGBvWfSZNELM', 'project', 'specifier', 'authorBio', 'TextareaField', 1, 1, 1),
  ('Wvsnoy64ilyJ', 'vGBvWfSZNELM', 'project', 'specifier', 'performer', 'InputField', 0, 1, 1),
  ('K0ceBm5NQFlF', 'vGBvWfSZNELM', 'project', 'classifier', 'performerBio', 'SelectField', 1, 1, 1),
  ('ROKJk1yKoRyh', 'vGBvWfSZNELM', 'project', 'classifier', 'genre', 'SelectField', 0, 1, 0);

INSERT OR IGNORE INTO "projectProperty" (
  "projectId",
  "propertyId",
  "isEnabled",
  "isDefaultEnabled",
  "rank"
)
VALUES
  ('vGBvWfSZNELM', 'j608565AMXfN', 1, 1, 0),
  ('vGBvWfSZNELM', 'ZkXV20T2Bsa7', 1, 1, 1),
  ('vGBvWfSZNELM', 'PLifDO417BbU', 1, 1, 2),
  ('vGBvWfSZNELM', 'w7L3$qPA41ij', 1, 1, 3),
  ('vGBvWfSZNELM', 'Wvsnoy64ilyJ', 1, 1, 4),
  ('vGBvWfSZNELM', 'K0ceBm5NQFlF', 1, 1, 5),
  ('vGBvWfSZNELM', 'ROKJk1yKoRyh', 1, 0, 6);

INSERT OR IGNORE INTO "propertyI18n" (
  "propertyId",
  "locale",
  "label",
  "labelGen",
  "placeholder",
  "placeholderGen"
)
VALUES
  ('K0ceBm5NQFlF', 'en', 'About the Performer', 0, 'Perform Bio', 0),
  ('K0ceBm5NQFlF', 'zh-hans', '关于表演者', 0, '进行简介', 0),
  ('K0ceBm5NQFlF', 'zh-hant', '關於表演者', 0, '演傳', 0),
  ('PLifDO417BbU', 'en', 'Author', 0, 'Name of author', 0),
  ('PLifDO417BbU', 'zh-hans', '作者', 0, '作者姓名', 0),
  ('PLifDO417BbU', 'zh-hant', '作者', 0, '作者姓名', 0),
  ('ROKJk1yKoRyh', 'en', 'Genre', 0, 'Select Genre', 0),
  ('ROKJk1yKoRyh', 'zh-hans', '体裁', 0, '精选体裁', 0),
  ('ROKJk1yKoRyh', 'zh-hant', '類型', 0, '選擇類型', 0),
  ('Wvsnoy64ilyJ', 'en', 'Performer', 0, 'Name of Performer', 0),
  ('Wvsnoy64ilyJ', 'zh-hans', '表演者', 0, '表演者姓名', 0),
  ('Wvsnoy64ilyJ', 'zh-hant', '表演者', 0, '表演者姓名', 0),
  ('ZkXV20T2Bsa7', 'en', 'Synopsis', 0, 'Synopsis', 0),
  ('ZkXV20T2Bsa7', 'zh-hans', '剧情简介', 0, '剧情简介', 0),
  ('ZkXV20T2Bsa7', 'zh-hant', '劇情簡介', 0, '劇情簡介', 0),
  ('j608565AMXfN', 'en', 'Country', 0, 'Select country', 0),
  ('j608565AMXfN', 'zh-hans', '乡村', 0, '选择国家', 0),
  ('j608565AMXfN', 'zh-hant', '國', 0, '選國', 0),
  ('w7L3$qPA41ij', 'en', 'Author Bio', 0, '', 0),
  ('w7L3$qPA41ij', 'zh-hans', '作者简介', 0, '', 0),
  ('w7L3$qPA41ij', 'zh-hant', '作者簡介', 0, '', 0);

INSERT OR IGNORE INTO "propertyValue" (
  "id",
  "propertyId",
  "rank",
  "value"
)
VALUES
  ('9jU5t299ZZv2', 'ROKJk1yKoRyh', 0, 'Crime'),
  ('u$C0_E5BOg36', 'ROKJk1yKoRyh', 1, 'Science Fiction'),
  ('6Eefs0cGxrSa', 'ROKJk1yKoRyh', 2, 'Memoir'),
  ('4XmVImb00448', 'ROKJk1yKoRyh', 3, 'Literary Fiction'),
  ('UJU1UdVHl39G', 'ROKJk1yKoRyh', 4, 'Satire'),
  ('4gCfnTfIyjs8', 'j608565AMXfN', 0, 'Belgium & Slovenia'),
  ('fB6nseLK9k71', 'j608565AMXfN', 1, 'Czechia'),
  ('97u0sJB8WjKr', 'j608565AMXfN', 2, 'France'),
  ('oNX7m$EI2QAc', 'j608565AMXfN', 3, 'Finland'),
  ('c8g3m0$7Bin8', 'j608565AMXfN', 4, 'Germany'),
  ('SEvRA5ti17R7', 'j608565AMXfN', 5, 'Hungary'),
  ('80W3pCYC5vQx', 'j608565AMXfN', 6, 'Italy'),
  ('KLMt4Zr$ia4p', 'j608565AMXfN', 7, 'Ireland'),
  ('ifnFW4WRxNhD', 'j608565AMXfN', 8, 'The Netherlands'),
  ('F08sWnOJ5hX9', 'j608565AMXfN', 9, 'Spain'),
  ('Am5$Z1oqwaa7', 'j608565AMXfN', 10, 'Ukraine');

INSERT OR IGNORE INTO "propertyValueI18n" (
  "propertyValueId",
  "locale",
  "value",
  "valueGen"
)
VALUES
  ('4gCfnTfIyjs8', 'en', 'Belgium & Slovenia', 0),
  ('4gCfnTfIyjs8', 'zh-hans', 'Belgium & Slovenia', 0),
  ('4gCfnTfIyjs8', 'zh-hant', 'Belgium & Slovenia', 0),
  ('80W3pCYC5vQx', 'en', 'Italy', 0),
  ('80W3pCYC5vQx', 'zh-hans', 'Italy', 0),
  ('80W3pCYC5vQx', 'zh-hant', 'Italy', 0),
  ('97u0sJB8WjKr', 'en', 'France', 0),
  ('97u0sJB8WjKr', 'zh-hans', 'France', 0),
  ('97u0sJB8WjKr', 'zh-hant', 'France', 0),
  ('Am5$Z1oqwaa7', 'en', 'Ukraine', 0),
  ('Am5$Z1oqwaa7', 'zh-hans', 'Ukraine', 0),
  ('Am5$Z1oqwaa7', 'zh-hant', 'Ukraine', 0),
  ('F08sWnOJ5hX9', 'en', 'Spain', 0),
  ('F08sWnOJ5hX9', 'zh-hans', 'Spain', 0),
  ('F08sWnOJ5hX9', 'zh-hant', 'Spain', 0),
  ('KLMt4Zr$ia4p', 'en', 'Ireland', 0),
  ('KLMt4Zr$ia4p', 'zh-hans', 'Ireland', 0),
  ('KLMt4Zr$ia4p', 'zh-hant', 'Ireland', 0),
  ('SEvRA5ti17R7', 'en', 'Hungary', 0),
  ('SEvRA5ti17R7', 'zh-hans', 'Hungary', 0),
  ('SEvRA5ti17R7', 'zh-hant', 'Hungary', 0),
  ('c8g3m0$7Bin8', 'en', 'Germany', 0),
  ('c8g3m0$7Bin8', 'zh-hans', 'Germany', 0),
  ('c8g3m0$7Bin8', 'zh-hant', 'Germany', 0),
  ('fB6nseLK9k71', 'en', 'Czechia', 0),
  ('fB6nseLK9k71', 'zh-hans', 'Czechia', 0),
  ('fB6nseLK9k71', 'zh-hant', 'Czechia', 0),
  ('ifnFW4WRxNhD', 'en', 'The Netherlands', 0),
  ('ifnFW4WRxNhD', 'zh-hans', 'The Netherlands', 0),
  ('ifnFW4WRxNhD', 'zh-hant', 'The Netherlands', 0),
  ('oNX7m$EI2QAc', 'en', 'Finland', 0),
  ('oNX7m$EI2QAc', 'zh-hans', 'Finland', 0),
  ('oNX7m$EI2QAc', 'zh-hant', 'Finland', 0);
