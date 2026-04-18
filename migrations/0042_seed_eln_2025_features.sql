PRAGMA foreign_keys=ON;

-- Seed ELN 2025 2nd edition features onto layer 0bf1RYWdpaAt.
--
-- Coordinates were derived from OSM/Nominatim by stripping the leading venue
-- text from displayAddress up to the first street number. For venue strings
-- without a street number in the supplied data, the canonical site address was
-- used instead:
-- - PMQ -> 35 Aberdeen Street, Central, Hong Kong
-- - Tai Kwun -> 10 Hollywood Rd, Central, Hong Kong

INSERT INTO "propertyValue" (
  "id",
  "propertyId",
  "rank",
  "value"
)
VALUES
  ('eln2025CountryBE', 'j608565AMXfN', 11, 'Belgium'),
  ('eln2025CountryPT', 'j608565AMXfN', 12, 'Portugal'),
  ('eln2025CountryCH', 'j608565AMXfN', 13, 'Switzerland')
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
  ('eln2025CountryBE', 'en', 'Belgium', 0),
  ('eln2025CountryBE', 'zh-hans', 'Belgium', 0),
  ('eln2025CountryBE', 'zh-hant', 'Belgium', 0),
  ('eln2025CountryPT', 'en', 'Portugal', 0),
  ('eln2025CountryPT', 'zh-hans', 'Portugal', 0),
  ('eln2025CountryPT', 'zh-hant', 'Portugal', 0),
  ('eln2025CountryCH', 'en', 'Switzerland', 0),
  ('eln2025CountryCH', 'zh-hans', 'Switzerland', 0),
  ('eln2025CountryCH', 'zh-hant', 'Switzerland', 0)
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
  ('0bf1RYWdpaAt', 'j608565AMXfN', 1, 1),
  ('0bf1RYWdpaAt', 'PLifDO417BbU', 1, 1),
  ('0bf1RYWdpaAt', 'Wvsnoy64ilyJ', 1, 1);

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
    'eln2025Book001',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1487604, 22.2862965)),
    json_object('longitude', 114.1487604, 'latitude', 22.2862965, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book002',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1474849, 22.2855464)),
    json_object('longitude', 114.1474849, 'latitude', 22.2855464, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book003',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
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
  ),
  (
    'eln2025Book004',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
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
    'eln2025Book005',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
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
    'eln2025Book006',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1511971, 22.2831158)),
    json_object('longitude', 114.1511971, 'latitude', 22.2831158, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book007',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
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
    'eln2025Book008',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
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
    'eln2025Book009',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1558924, 22.2810995)),
    json_object('longitude', 114.1558924, 'latitude', 22.2810995, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book010',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1560248, 22.2807639)),
    json_object('longitude', 114.1560248, 'latitude', 22.2807639, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book011',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1551177, 22.2804411)),
    json_object('longitude', 114.1551177, 'latitude', 22.2804411, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
    1,
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    0,
    0,
    1
  ),
  (
    'eln2025Book012',
    '8dEPyZg_5ov_',
    'vGBvWfSZNELM',
    '0bf1RYWdpaAt',
    'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    json_object('type', 'Point', 'coordinates', json_array(114.1551177, 22.2804411)),
    json_object('longitude', 114.1551177, 'latitude', 22.2804411, 'addressForwardGeocoder', 'osm_nominatim', 'addressForwardGen', 1),
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
  ('eln2025Book001', 'en', 'Glorious People', 0, NULL, 0, 'Project House 1 Queen''s Rd W, Sheung Wan, Hong Kong', 0, '{}'),
  ('eln2025Book002', 'en', 'Gerta', 0, NULL, 0, 'COMMAA, Shop 2, G/F, 11 Po Yan St, Sheung Wan, Hong Kong', 0, '{}'),
  ('eln2025Book003', 'en', 'Sad Tiger', 0, NULL, 0, 'La Galerie Paris 1839, G/F, 74 Hollywood Rd, Central, Hong Kong', 0, '{}'),
  ('eln2025Book004', 'en', 'Perfection', 0, NULL, 0, 'La Biblioteca Italian Library Hong Kong, PMQ - Hollywood, Central, Hong Kong', 0, '{}'),
  ('eln2025Book005', 'en', 'The End', 0, NULL, 0, 'Taste Library, H501, PMQ, 35 Aberdeen Street, Central', 0, '{}'),
  ('eln2025Book006', 'en', 'Fishing for the Little Pike', 0, NULL, 0, 'Habyt, 8 Wa In Fong West, Central', 0, '{}'),
  ('eln2025Book007', 'en', 'Dubliners', 0, NULL, 0, 'Bookazine Social, Tai Kwun, Central', 0, '{}'),
  ('eln2025Book008', 'en', 'The City of Mist', 0, NULL, 0, 'Taste Library, H503, PMQ, 35 Aberdeen Street, Central', 0, '{}'),
  ('eln2025Book009', 'en', 'First Blood', 0, NULL, 0, 'Parenthèses, 2/F, Duke of Wellington House, 14-24 Wellington Street, Central', 0, '{}'),
  ('eln2025Book010', 'en', 'Death at Intervals', 0, NULL, 0, 'The Flying Club, 1802, 18/F, Wellington Place, 2-8 Wellington Street, Central', 0, '{}'),
  ('eln2025Book011', 'en', 'The Alaska Sanders Affairs', 0, NULL, 0, 'Wyndham Social, G/F, 33 Wyndham St, Central', 0, '{}'),
  ('eln2025Book012', 'en', 'The Factory', 0, NULL, 0, 'Wyndham Social, G/F, 33 Wyndham St, Central', 0, '{}')
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
  ('eln2025Book001', 'j608565AMXfN', 'c8g3m0$7Bin8', NULL),
  ('eln2025Book001', 'PLifDO417BbU', NULL, 'Sasha Salzmann'),
  ('eln2025Book001', 'Wvsnoy64ilyJ', NULL, 'Chan Yuen Yu Caroline'),
  ('eln2025Book002', 'j608565AMXfN', 'fB6nseLK9k71', NULL),
  ('eln2025Book002', 'PLifDO417BbU', NULL, 'Kateřina Tučková'),
  ('eln2025Book002', 'Wvsnoy64ilyJ', NULL, 'Vincent Tang Ka-lai'),
  ('eln2025Book003', 'j608565AMXfN', '97u0sJB8WjKr', NULL),
  ('eln2025Book003', 'PLifDO417BbU', NULL, 'Neige Sinno'),
  ('eln2025Book003', 'Wvsnoy64ilyJ', NULL, 'Angela Yu'),
  ('eln2025Book004', 'j608565AMXfN', '80W3pCYC5vQx', NULL),
  ('eln2025Book004', 'PLifDO417BbU', NULL, 'Vincenzo Latronico'),
  ('eln2025Book004', 'Wvsnoy64ilyJ', NULL, 'Lilli Chung'),
  ('eln2025Book005', 'j608565AMXfN', 'SEvRA5ti17R7', NULL),
  ('eln2025Book005', 'PLifDO417BbU', NULL, 'Attila Bartis'),
  ('eln2025Book005', 'Wvsnoy64ilyJ', NULL, 'Attila Gönczy, VULGO Theatre'),
  ('eln2025Book006', 'j608565AMXfN', 'oNX7m$EI2QAc', NULL),
  ('eln2025Book006', 'PLifDO417BbU', NULL, 'Juhani Karila'),
  ('eln2025Book006', 'Wvsnoy64ilyJ', NULL, 'Gavin Coates'),
  ('eln2025Book007', 'j608565AMXfN', 'KLMt4Zr$ia4p', NULL),
  ('eln2025Book007', 'PLifDO417BbU', NULL, 'James Joyce'),
  ('eln2025Book007', 'Wvsnoy64ilyJ', NULL, 'Ki Kwok'),
  ('eln2025Book008', 'j608565AMXfN', 'F08sWnOJ5hX9', NULL),
  ('eln2025Book008', 'PLifDO417BbU', NULL, 'Carlos Ruiz Zafón'),
  ('eln2025Book008', 'Wvsnoy64ilyJ', NULL, 'Carlos Koo'),
  ('eln2025Book009', 'j608565AMXfN', 'eln2025CountryBE', NULL),
  ('eln2025Book009', 'PLifDO417BbU', NULL, 'Amélie Nothomb'),
  ('eln2025Book009', 'Wvsnoy64ilyJ', NULL, 'Rachel Smith'),
  ('eln2025Book010', 'j608565AMXfN', 'eln2025CountryPT', NULL),
  ('eln2025Book010', 'PLifDO417BbU', NULL, 'José Saramago'),
  ('eln2025Book010', 'Wvsnoy64ilyJ', NULL, 'José Geral'),
  ('eln2025Book011', 'j608565AMXfN', 'eln2025CountryCH', NULL),
  ('eln2025Book011', 'PLifDO417BbU', NULL, 'Joël Dicker'),
  ('eln2025Book011', 'Wvsnoy64ilyJ', NULL, 'Ms. Eva Wong'),
  ('eln2025Book012', 'j608565AMXfN', 'Am5$Z1oqwaa7', NULL),
  ('eln2025Book012', 'PLifDO417BbU', NULL, 'Ihor Mysiak'),
  ('eln2025Book012', 'Wvsnoy64ilyJ', NULL, 'Nataliia Prysiazhniukiuk')
ON CONFLICT("featureId", "propertyId") DO UPDATE SET
  "propertyValueId" = excluded."propertyValueId",
  "value" = excluded."value";
