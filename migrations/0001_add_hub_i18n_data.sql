-- Custom SQL migration file, put your code below! --

-- Insert hub i18n data for Core Hub
INSERT INTO "hubI18n" ("hubId", "locale", "name", "nameShort", "description") VALUES
  ('4Jsk5LngvFZq', 'en', 'Core Hub', 'Core', 'The main hub for core organizations and projects'),
  ('4Jsk5LngvFZq', 'zh-hans', '核心中心', '核心', '核心组织和项目的主要中心'),
  ('4Jsk5LngvFZq', 'zh-hant', '核心中心', '核心', '核心組織和項目的主要中心');