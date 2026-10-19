-- Refs #194, #213. MTR access is server-owned feature data, not configurable input.
-- Preserve HYPE phoneNumber and all unrelated property definitions/assignments.
-- Abort if legacy feature values exist: they must be reviewed before retirement.
CREATE TABLE _mtr_retirement_guard (ok INTEGER CHECK (ok = 1));
INSERT INTO _mtr_retirement_guard
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM featureProperty WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01')
) THEN 1 ELSE 0 END;
DROP TABLE _mtr_retirement_guard;
DELETE FROM propertyValueI18n WHERE propertyValueId IN (
  SELECT id FROM propertyValue WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01')
);
DELETE FROM propertyValue WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM propertyI18n WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM layerProperty WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM projectProperty WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM organisationProperty WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM hubProperty WHERE propertyId IN ('gPropMtrSt01','gPropMtrEx01');
DELETE FROM property WHERE id IN ('gPropMtrSt01','gPropMtrEx01')
  AND key IN ('nearestMtrStation','mtrExit');
