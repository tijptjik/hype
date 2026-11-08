-- Explicit staff analytics access; existing members receive no new permissions.
ALTER TABLE organisationRole ADD COLUMN viewAnalytics INTEGER NOT NULL DEFAULT 0 CHECK(viewAnalytics IN (0, 1));
