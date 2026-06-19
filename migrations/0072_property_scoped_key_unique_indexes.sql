CREATE UNIQUE INDEX IF NOT EXISTS "property_scope_projectId_key_idx"
ON "property" ("scope", "projectId", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "property_scope_organisationId_key_idx"
ON "property" ("scope", "organisationId", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "property_scope_hubId_key_idx"
ON "property" ("scope", "hubId", "key");
