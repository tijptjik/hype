ALTER TABLE "projectProperty"
ADD COLUMN "isDefaultEnabled" integer NOT NULL DEFAULT false;

UPDATE "projectProperty"
SET "isDefaultEnabled" = COALESCE(
  (
    SELECT "p"."isDefaultEnabled"
    FROM "property" AS "p"
    WHERE "p"."id" = "projectProperty"."propertyId"
  ),
  false
);
