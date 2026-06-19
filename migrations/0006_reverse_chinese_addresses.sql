-- Custom SQL migration file, put your code below! --

-- Update featureI18n table to construct Chinese formatted addresses
WITH address_components AS (
  SELECT
    featureId,
    locale,
    json_extract(addressProperties, '$.district') as district,
    json_extract(addressProperties, '$.streetName') as street_name,
    json_extract(addressProperties, '$.buildingNumberFrom') as building_number_from,
    json_extract(addressProperties, '$.buildingNumberTo') as building_number_to,
    json_extract(addressProperties, '$.estateName') as estate_name,
    json_extract(addressProperties, '$.phaseNumber') as phase_number,
    json_extract(addressProperties, '$.buildingName') as building_name,
    json_extract(addressProperties, '$.blockNumber') as block_number,
    json_extract(addressProperties, '$.blockType') as block_type
  FROM featureI18n
  WHERE addressProperties IS NOT NULL
    AND json_valid(addressProperties)
    AND locale IN ('zhHans', 'zhHant')
),
formatted_addresses AS (
  SELECT
    featureId,
    locale,
    TRIM(
      COALESCE(district, '')
      || CASE
         WHEN street_name IS NOT NULL THEN
           COALESCE(street_name, '')
           || CASE
              WHEN building_number_from IS NOT NULL THEN
                building_number_from
                || COALESCE(
                  CASE
                    WHEN building_number_to IS NOT NULL AND building_number_to != building_number_from
                    THEN '-' || building_number_to
                    ELSE ''
                  END,
                  ''
                ) || '號'
              ELSE ''
              END
         ELSE ''
         END
      || CASE
         WHEN estate_name IS NOT NULL THEN
           COALESCE(estate_name, '')
           || CASE
              WHEN phase_number IS NOT NULL THEN '第' || phase_number || '期'
              ELSE ''
              END
         ELSE ''
         END
      || COALESCE(building_name, '')
      || CASE
         WHEN block_number IS NOT NULL AND block_type IS NOT NULL THEN
           block_number || block_type
         ELSE ''
         END
    ) as formatted_address_zh
  FROM address_components
)
UPDATE featureI18n
SET
  displayAddress = fa.formatted_address_zh,
  displayAddressGen = 1
FROM formatted_addresses fa
WHERE featureI18n.featureId = fa.featureId
  AND featureI18n.locale = fa.locale
  AND fa.formatted_address_zh != '';
