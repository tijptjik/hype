-- Refs #194, #213. Preserve historical address evidence without inventing canonical
-- SaanSeoi identities or snapshots. Existing display text and pin geometry stay unchanged.
-- Existing canonical envelopes are left intact, making the data conversion repeatable.
-- D1 disallows TEMP tables; this transaction-scoped staging table is dropped below.
CREATE TABLE _feature_address_0107 (id TEXT PRIMARY KEY);
INSERT INTO _feature_address_0107 SELECT id FROM feature
WHERE json_extract(coalesce(addressMeta, '{}'), '$.address.version') IS NULL;

UPDATE feature
SET addressMeta = json_set(coalesce(addressMeta, '{}'), '$.address', json_object(
  'version', 1,
  'source', json_object(
    'status', 'unresolved', 'address2dId', NULL, 'address3dId', NULL,
    'address3dUnitId', NULL, 'addressSnapshotId', NULL, 'records', json('{}'),
    'fallbackDisplay', json(coalesce((SELECT json_group_object(i.locale, coalesce(i.displayAddress, ''))
      FROM featureI18n i WHERE i.featureId = feature.id), '{}'))),
  'coordinates', json(CASE WHEN json_extract(geometry, '$.type') = 'Point'
    THEN json_array(json_extract(geometry, '$.coordinates[0]'), json_extract(geometry, '$.coordinates[1]')) ELSE 'null' END),
  'matchStatus', 'unresolved', 'overrides', json('{}'),
  'legacy', json_object(
    'addressMeta', json(coalesce(addressMeta, '{}')),
    'i18n', json(coalesce((SELECT json_group_object(i.locale, json_object(
      'displayAddress', i.displayAddress, 'displayAddressGen', i.displayAddressGen,
      'addressProperties', json(coalesce(i.addressProperties, '{}'))))
      FROM featureI18n i WHERE i.featureId = feature.id), '{}')))))
WHERE id IN (SELECT id FROM _feature_address_0107);

-- Retire the old structured projection only after its complete evidence was archived.
-- Legacy columns remain for compatibility with old imports; new geocoder/editor writes
-- use the canonical envelope. Display columns remain materialized read projections.
UPDATE featureI18n SET addressProperties = '{}'
WHERE featureId IN (SELECT id FROM _feature_address_0107);
DROP TABLE _feature_address_0107;
