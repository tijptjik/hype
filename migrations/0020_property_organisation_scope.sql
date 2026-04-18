ALTER TABLE "property"
ADD COLUMN "organisationId" text REFERENCES "organisation"("id") ON UPDATE cascade ON DELETE cascade;

CREATE INDEX "property_organisationId_idx" ON "property" ("organisationId");
