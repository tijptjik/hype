-- Align retained canonical address records and corrections with SaanSeoi's field name.
-- This is a schema rename only: keep source identity, snapshots, pins and legacy evidence.
UPDATE feature SET addressMeta = json_set(addressMeta,
  '$.address.source', json(replace(json_extract(addressMeta, '$.address.source'), '"estateName":', '"premisesName":')),
  '$.address.overrides', json(replace(json_extract(addressMeta, '$.address.overrides'), '"estateName":', '"premisesName":'))
) WHERE json_extract(addressMeta, '$.address.version') = 1;
