-- Server-owned token gates child writes in atomic unlinked Feature form saves.
-- Refs #194; spec/breadline/proposal/01-places-features.md.
ALTER TABLE feature ADD COLUMN formWriteToken TEXT;
