-- Refs #194. Codes belong to an operator's namespace; maps reference the maintained registry.
ALTER TABLE locationOperator ADD COLUMN referenceCode TEXT CHECK(referenceCode IS NULL OR (length(trim(referenceCode))>0 AND referenceCode=trim(referenceCode)));
CREATE UNIQUE INDEX location_operator_reference ON locationOperator(operatorId,referenceCode);
CREATE TABLE locationPremisesMap (
  locationId TEXT PRIMARY KEY NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  mapId TEXT UNIQUE NOT NULL CHECK(length(trim(mapId))>0),
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Exact imported station identities only; codes are not inferred from names or coordinates.
UPDATE locationOperator SET referenceCode=(SELECT substr(d.sourceKey,13) FROM locationCanonicalDraft d WHERE d.locationId=locationOperator.locationId)
WHERE operatorId='mtr-corporation' AND locationId IN (
 SELECT d.locationId FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
 WHERE d.sourceKey GLOB 'mtr-station:[A-Z][A-Z][A-Z]' AND l.matchingType='premises' AND l.state!='redirect'
);
INSERT INTO locationPremisesMap(locationId,mapId,createdBy)
SELECT lo.locationId,CASE lo.referenceCode WHEN 'KET' THEN 'kennedy-town-mtr' WHEN 'HOK' THEN 'hong-kong-mtr' END,'migration:0254'
FROM locationOperator lo JOIN locationCanonicalDraft d ON d.locationId=lo.locationId
WHERE lo.operatorId='mtr-corporation' AND d.sourceKey='mtr-station:'||lo.referenceCode AND lo.referenceCode IN ('KET','HOK');
