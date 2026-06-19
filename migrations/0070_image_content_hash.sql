-- Persist normalized upload hashes so the importer can detect exact duplicates.

ALTER TABLE image ADD COLUMN contentHash text;

CREATE INDEX image_content_hash_idx ON image(contentHash);
