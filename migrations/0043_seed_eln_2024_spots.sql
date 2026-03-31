PRAGMA foreign_keys=ON;

-- Seed ELN 2024 spot features onto layer lvWu_dCwiVZt.
--
-- Coordinates were derived from OSM/Nominatim by stripping the leading venue
-- text from displayAddress up to the first street number.

INSERT INTO "property" (
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
VALUES (
  'eln2024HostProp',
  'vGBvWfSZNELM',
  'project',
  'classifier',
  'host',
  'SelectField',
  1,
  1,
  1
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled";

INSERT INTO "projectProperty" (
  "projectId",
  "propertyId",
  "isEnabled",
  "isDefaultEnabled",
  "rank"
)
VALUES (
  'vGBvWfSZNELM',
  'eln2024HostProp',
  1,
  1,
  8
)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

DELETE FROM "propertyI18n" WHERE "propertyId" = 'eln2024HostProp';

INSERT INTO "propertyI18n" (
  "propertyId",
  "locale",
  "label",
  "labelGen",
  "placeholder",
  "placeholderGen"
)
VALUES
  ('eln2024HostProp', 'en', 'Host', 0, 'Select host', 0),
  ('eln2024HostProp', 'zh-hans', '主办方', 0, '选择主办方', 0),
  ('eln2024HostProp', 'zh-hant', '主辦方', 0, '選擇主辦方', 0);

INSERT INTO "propertyValue" (
  "id",
  "propertyId",
  "rank",
  "value"
)
VALUES
  ('eln2024Host001', 'eln2024HostProp', 0, 'Goethe-Institut Hongkong'),
  ('eln2024Host002', 'eln2024HostProp', 1, 'Consulate General of Czechia'),
  ('eln2024Host003', 'eln2024HostProp', 2, 'Italian Cultural Institute of Hong Kong'),
  ('eln2024Host004', 'eln2024HostProp', 3, 'Alliance Francaise')
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValueI18n" (
  "propertyValueId",
  "locale",
  "value",
  "valueGen"
)
VALUES
  ('eln2024Host001', 'en', 'Goethe-Institut Hongkong', 0),
  ('eln2024Host001', 'zh-hans', 'Goethe-Institut Hongkong', 0),
  ('eln2024Host001', 'zh-hant', 'Goethe-Institut Hongkong', 0),
  ('eln2024Host002', 'en', 'Consulate General of Czechia', 0),
  ('eln2024Host002', 'zh-hans', 'Consulate General of Czechia', 0),
  ('eln2024Host002', 'zh-hant', 'Consulate General of Czechia', 0),
  ('eln2024Host003', 'en', 'Italian Cultural Institute of Hong Kong', 0),
  ('eln2024Host003', 'zh-hans', 'Italian Cultural Institute of Hong Kong', 0),
  ('eln2024Host003', 'zh-hant', 'Italian Cultural Institute of Hong Kong', 0),
  ('eln2024Host004', 'en', 'Alliance Francaise', 0),
  ('eln2024Host004', 'zh-hans', 'Alliance Francaise', 0),
  ('eln2024Host004', 'zh-hant', 'Alliance Francaise', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "layerProperty" (
  "layerId",
  "propertyId",
  "isVisible",
  "isUserContributable"
)
VALUES
  ('lvWu_dCwiVZt', 'eln2024HostProp', 1, 1);

INSERT INTO "feature" (
  "id",
  "organisationId",
  "projectId",
  "layerId",
  "contributorId",
  "geometry",
  "addressMeta",
  "isPublished",
  "publisherId",
  "publishedAt",
  "isPendingReview",
  "isArchived",
  "isIntangible",
  "isVisitable"
)
VALUES
  (
    'eln2024Spot001',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    'lvWu_dCwiVZt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1540090, 22.2811562)),
    json_object('longitude', 114.1540090, 'latitude', 22.2811562, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2024Spot002',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    'lvWu_dCwiVZt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1491064, 22.2849974)),
    json_object('longitude', 114.1491064, 'latitude', 22.2849974, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2024Spot003',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    'lvWu_dCwiVZt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1518456, 22.2832741)),
    json_object('longitude', 114.1518456, 'latitude', 22.2832741, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2024Spot004',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    'lvWu_dCwiVZt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1524557, 22.2833220)),
    json_object('longitude', 114.1524557, 'latitude', 22.2833220, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  )
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "projectId" = excluded."projectId",
  "layerId" = excluded."layerId",
  "contributorId" = excluded."contributorId",
  "geometry" = excluded."geometry",
  "addressMeta" = excluded."addressMeta",
  "isPublished" = excluded."isPublished",
  "publisherId" = excluded."publisherId",
  "publishedAt" = excluded."publishedAt",
  "isPendingReview" = excluded."isPendingReview",
  "isArchived" = excluded."isArchived",
  "isIntangible" = excluded."isIntangible",
  "isVisitable" = excluded."isVisitable";

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
VALUES
  ('eln2024Spot001', 'en', 'Spot 1 - Kairos', 0, NULL, 0, 'Taschen, Shop 01-G02, Tai Kwun, 10 Hollywood Rd, Central', 0, '{}'),
  ('eln2024Spot002', 'en', 'Spot 2 - The Lake', 0, NULL, 0, 'Novalis Art Design, 197 Hollywood Road, Hong Kong', 0, '{}'),
  ('eln2024Spot003', 'en', 'Spot 3 - My Stupid Intentions', 0, NULL, 0, 'La Biblioteca Italian Library, R H210, Block B, PMQ, 35 Aberdeen Street, Central', 0, '{}'),
  ('eln2024Spot004', 'en', 'Spot 4 - Dear Dickhead', 0, NULL, 0, 'La Galerie, G/F, 74 Hollywood Road, Central', 0, '{}')
ON CONFLICT("featureId", "locale") DO UPDATE SET
  "title" = excluded."title",
  "titleGen" = excluded."titleGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen",
  "displayAddress" = excluded."displayAddress",
  "displayAddressGen" = excluded."displayAddressGen",
  "addressProperties" = excluded."addressProperties";

INSERT INTO "featureProperty" (
  "featureId",
  "propertyId",
  "propertyValueId",
  "value"
)
VALUES
  ('eln2024Spot001', 'eln2024HostProp', 'eln2024Host001', NULL),
  ('eln2024Spot002', 'eln2024HostProp', 'eln2024Host002', NULL),
  ('eln2024Spot003', 'eln2024HostProp', 'eln2024Host003', NULL),
  ('eln2024Spot004', 'eln2024HostProp', 'eln2024Host004', NULL)
ON CONFLICT("featureId", "propertyId") DO UPDATE SET
  "propertyValueId" = excluded."propertyValueId",
  "value" = excluded."value";
