-- Snapshot backfill of hub/global property `isDefaultEnabled`
-- based on current production/local canonical values.
-- Generated from current DB state on 2026-03-08.

UPDATE "property"
SET "isDefaultEnabled" = CASE "id"
  WHEN 'gPropGrade01' THEN 1
  WHEN 'gPropPhNum01' THEN 0
  WHEN 'gPropMtrSt01' THEN 0
  WHEN 'gPropWaNum01' THEN 0
  WHEN 'gPropMtrEx01' THEN 0
  ELSE "isDefaultEnabled"
END
WHERE "scope" = 'hub'
  AND "id" IN (
    'gPropGrade01',
    'gPropPhNum01',
    'gPropMtrSt01',
    'gPropWaNum01',
    'gPropMtrEx01'
  );
