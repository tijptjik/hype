-- Correct Nam Wan Bookshop's mistaken Wan Chai geocoder match, not its Peng Chau point.
-- The retained raw address is "38C, Wing Hing Street, Ping Chau"; the point is about
-- 16 m from the bundled OSM building named Nam Wan Bookshop on Peng Chau.
-- Keep geometry, media, MTR state, ownership and division memberships unchanged.
-- Freeze eligibility so reruns and independently corrected records are harmless.
CREATE TABLE _nam_wan_address_0104 (id TEXT PRIMARY KEY NOT NULL);
INSERT INTO _nam_wan_address_0104
SELECT f.id FROM feature f
WHERE f.id='HSENhLl6mUXX'
  AND json_extract(f.geometry,'$.type')='Point'
  AND json_extract(f.geometry,'$.coordinates[0]')=114.03864
  AND json_extract(f.geometry,'$.coordinates[1]')=22.28348
  AND json_extract(f.addressMeta,'$.geoAddressCode')='3782616278T20050430'
  AND EXISTS (SELECT 1 FROM featureI18n i WHERE i.featureId=f.id AND i.locale='en'
    AND i.title='Nam Wan Bookshop'
    AND i.displayAddress='Wing Hing St Refuse Collection Point & Public Toilet, 15 Wing Hing St, Wan Chai'
    AND json_extract(i.addressProperties,'$.rawAddress')='38C, Wing Hing Street, Ping Chau');

-- Only replace the three known bad locale records; preserve independent edits.
UPDATE featureI18n
SET displayAddress=CASE locale
    WHEN 'en' THEN '38C Wing Hing Street, Peng Chau'
    WHEN 'zh-hans' THEN '坪洲永兴街38C号'
    ELSE '坪洲永興街38C號' END,
  displayAddressGen=0,
  addressProperties=json_set(
    json_remove(coalesce(addressProperties,'{}'), '$.buildingName', '$.blockType', '$.premisesName'),
    '$.buildingNumberFrom','38C',
    '$.streetName',CASE locale WHEN 'en' THEN 'Wing Hing Street' WHEN 'zh-hans' THEN '永兴街' ELSE '永興街' END,
    '$.district',CASE locale WHEN 'en' THEN 'Islands' WHEN 'zh-hans' THEN '离岛区' ELSE '離島區' END,
    '$.area',CASE locale WHEN 'en' THEN 'New Territories' WHEN 'zh-hans' THEN '新界' ELSE '新界' END)
WHERE featureId IN (SELECT id FROM _nam_wan_address_0104)
  AND ((locale='en' AND displayAddress='Wing Hing St Refuse Collection Point & Public Toilet, 15 Wing Hing St, Wan Chai')
    OR (locale IN ('zh-hans','zh-hant') AND displayAddress='灣仔區永興街15號永興街垃圾收集站及公廁'))
  AND json_extract(addressProperties,'$.rawAddress')='38C, Wing Hing Street, Ping Chau';

-- Drop only metadata from the rejected geocoder match, retaining raw coordinates.
UPDATE feature SET addressMeta=json_remove(addressMeta,
    '$.geoAddressCode','$.distanceFromPoint','$.longitude','$.latitude',
    '$.confidenceForwardGeocoder','$.addressForwardGeocoder','$.addressForwardGen'),
  modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (SELECT id FROM _nam_wan_address_0104);
DROP TABLE _nam_wan_address_0104;
