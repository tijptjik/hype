-- Refs #194, #180. Property preparation for the Breadline feature import.
-- Preserve established IDs and assignments; fail rather than silently merge
-- conflicting catalogs. PhoneField uses the existing TEXT component column.
CREATE TABLE __breadline_property_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO __breadline_property_guard
SELECT CASE WHEN
  (SELECT count(*) FROM hub WHERE code = 'core') = 1 AND
  (SELECT count(*) FROM organisation WHERE code = 'hkfoodworks') = 1 AND
  NOT EXISTS (SELECT 1 FROM property WHERE id = 'gPropPhNum01'
    AND (key <> 'phoneNumber' OR scope <> 'hub' OR hubId IS NOT (SELECT id FROM hub WHERE code = 'core'))) AND
  NOT EXISTS (SELECT 1 FROM property WHERE key = 'phoneNumber' AND scope = 'hub'
    AND hubId = (SELECT id FROM hub WHERE code = 'core') AND id <> 'gPropPhNum01') AND
  NOT EXISTS (SELECT 1 FROM property WHERE id = 'WhWlW8KcN2wq'
    AND (key <> 'brand' OR NOT (
      (scope = 'project' AND projectId = (SELECT id FROM project WHERE code = 'breadline')) OR
      (scope = 'organisation' AND organisationId = (SELECT id FROM organisation WHERE code = 'hkfoodworks'))))) AND
  NOT EXISTS (SELECT 1 FROM property WHERE key = 'brand' AND scope = 'organisation'
    AND organisationId = (SELECT id FROM organisation WHERE code = 'hkfoodworks') AND id <> 'WhWlW8KcN2wq')
THEN 1 ELSE 0 END;
DROP TABLE __breadline_property_guard;

INSERT INTO property (id, hubId, scope, type, key, component, isTranslatable, isDefaultEnabled)
SELECT 'gPropPhNum01', id, 'hub', 'specifier', 'phoneNumber', 'PhoneField', 0, 0
FROM hub WHERE code = 'core'
ON CONFLICT(id) DO UPDATE SET component = 'PhoneField', isTranslatable = 0,
  modifiedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO property (id, organisationId, scope, type, key, component, isTranslatable, isDefaultEnabled)
SELECT 'WhWlW8KcN2wq', id, 'organisation', 'classifier', 'brand', 'SelectField', 1, 0
FROM organisation WHERE code = 'hkfoodworks'
ON CONFLICT(id) DO UPDATE SET scope = 'organisation', projectId = NULL, hubId = NULL,
  organisationId = excluded.organisationId,
  modifiedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO hubProperty (hubId, propertyId, rank)
SELECT id, 'gPropPhNum01', COALESCE((SELECT MAX(rank) + 1 FROM hubProperty WHERE hubId = hub.id), 0)
FROM hub WHERE code = 'core'
ON CONFLICT(hubId, propertyId) DO NOTHING;
INSERT INTO organisationProperty (organisationId, propertyId, rank)
SELECT id, 'WhWlW8KcN2wq', COALESCE((SELECT MAX(rank) + 1 FROM organisationProperty WHERE organisationId = organisation.id), 0)
FROM organisation WHERE code = 'hkfoodworks'
ON CONFLICT(organisationId, propertyId) DO NOTHING;

-- Retain existing translations and assignments except the reviewed brand names.
INSERT INTO propertyI18n (propertyId, locale, label, placeholder, labelGen, placeholderGen)
SELECT p.id, l.locale,
 CASE WHEN p.key = 'phoneNumber' THEN l.phoneLabel ELSE l.brandLabel END,
 CASE WHEN p.key = 'phoneNumber' THEN l.phoneHint ELSE l.brandHint END, 0, 0
FROM property p CROSS JOIN (
 SELECT 'en' locale, 'Phone Number' phoneLabel, 'Brand' brandLabel, '+852 2345 6789' phoneHint, 'Select brand' brandHint
 UNION ALL SELECT 'zh-hans', '电话号码', '品牌', '+852 2345 6789', '选择品牌'
 UNION ALL SELECT 'zh-hant', '電話號碼', '品牌', '+852 2345 6789', '選擇品牌'
) l
WHERE p.id IN ('gPropPhNum01', 'WhWlW8KcN2wq')
 AND NOT EXISTS (SELECT 1 FROM propertyI18n i WHERE i.propertyId = p.id AND i.locale = l.locale);

CREATE TABLE __breadline_brand_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO __breadline_brand_guard SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM propertyValue WHERE id IN ('7ZvF0blB7t3c', 'C181ezlDw6hu', 'f6F0jfv4whUw', 'dzs4TYXuJncr', 'E6c2h1CF76tu') AND propertyId <> 'WhWlW8KcN2wq') THEN 1 ELSE 0 END;
DROP TABLE __breadline_brand_guard;

INSERT INTO propertyValue (id, propertyId, rank) VALUES
('7ZvF0blB7t3c', 'WhWlW8KcN2wq', 0),
('C181ezlDw6hu', 'WhWlW8KcN2wq', 1),
('f6F0jfv4whUw', 'WhWlW8KcN2wq', 2),
('dzs4TYXuJncr', 'WhWlW8KcN2wq', 3),
('E6c2h1CF76tu', 'WhWlW8KcN2wq', 4)
ON CONFLICT(id) DO NOTHING;

INSERT INTO propertyValueI18n (propertyValueId, locale, value, valueGen) VALUES
('7ZvF0blB7t3c', 'en', 'Maxim''s', 0),
('7ZvF0blB7t3c', 'zh-hans', '美心西饼', 0),
('7ZvF0blB7t3c', 'zh-hant', '美心西餅', 0),
('C181ezlDw6hu', 'en', 'Arome', 0),
('C181ezlDw6hu', 'zh-hans', '东海堂', 0),
('C181ezlDw6hu', 'zh-hant', '東海堂', 0),
('f6F0jfv4whUw', 'en', '7-Eleven', 0),
('f6F0jfv4whUw', 'zh-hans', '7-Eleven', 0),
('f6F0jfv4whUw', 'zh-hant', '7-Eleven', 0),
('dzs4TYXuJncr', 'en', 'Saint Honore', 0),
('dzs4TYXuJncr', 'zh-hans', '圣安娜饼屋', 0),
('dzs4TYXuJncr', 'zh-hant', '聖安娜餅屋', 0),
('E6c2h1CF76tu', 'en', 'Yamazaki', 0),
('E6c2h1CF76tu', 'zh-hans', '山崎面包', 0),
('E6c2h1CF76tu', 'zh-hant', '山崎麵包', 0)
ON CONFLICT(propertyValueId, locale) DO UPDATE SET value = excluded.value, valueGen = 0;
