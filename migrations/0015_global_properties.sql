ALTER TABLE "property" RENAME COLUMN "isUserContributed" TO "isUserContributable";

ALTER TABLE "property" ADD COLUMN "hubId" text REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade;

ALTER TABLE "property" ADD COLUMN "scope" text NOT NULL DEFAULT 'project';

ALTER TABLE "property" ADD COLUMN "isDefaultEnabled" integer NOT NULL DEFAULT false;

CREATE TABLE "projectProperty" (
  "projectId" text NOT NULL REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade,
  "propertyId" text NOT NULL REFERENCES "property"("id") ON UPDATE cascade ON DELETE cascade,
  "rank" integer NOT NULL DEFAULT 0,
  PRIMARY KEY("projectId", "propertyId")
);

CREATE INDEX "property_projectId_idx" ON "property" ("projectId");
CREATE INDEX "property_hubId_idx" ON "property" ("hubId");
CREATE INDEX "property_scope_idx" ON "property" ("scope");
CREATE INDEX "projectProperty_projectId_idx" ON "projectProperty" ("projectId");
CREATE INDEX "projectProperty_propertyId_idx" ON "projectProperty" ("propertyId");
