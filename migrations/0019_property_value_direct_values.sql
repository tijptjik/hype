ALTER TABLE "propertyValue" ADD COLUMN "value" text;

UPDATE "property"
SET "isTranslatable" = false
WHERE "id" = 'gPropMtrEx01';

UPDATE "propertyValue"
SET "value" = (
  SELECT "propertyValueI18n"."value"
  FROM "propertyValueI18n"
  WHERE "propertyValueI18n"."propertyValueId" = "propertyValue"."id"
    AND "propertyValueI18n"."locale" = 'en'
  LIMIT 1
)
WHERE "propertyValue"."propertyId" = 'gPropMtrEx01';

DELETE FROM "propertyValueI18n"
WHERE "propertyValueId" IN (
  SELECT "id"
  FROM "propertyValue"
  WHERE "propertyId" = 'gPropMtrEx01'
);
