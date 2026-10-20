-- Keep existing catalogue cursors valid; new runs read their captured linked IDs.
-- Refs #194. spec/breadline/proposal/01-places-features.md
ALTER TABLE placeRefresh ADD COLUMN scanMode TEXT NOT NULL DEFAULT 'catalogue'
  CHECK(scanMode IN ('catalogue','identities'));
