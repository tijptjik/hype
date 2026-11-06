-- Refs #194. Pre-release Location policy remains schema version 1.
-- Additive schema only: retained Project policies and immutable proposal evidence stay unchanged.
-- Project policy uses follow directly; no compatibility contract for unpublished drafts.
ALTER TABLE layer ADD COLUMN relocationPolicy TEXT
  CHECK (relocationPolicy IS NULL OR relocationPolicy IN ('fixed','review','follow'));
ALTER TABLE layer ADD COLUMN relocationPolicyRevision INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(relocationPolicyRevision) = 'integer' AND relocationPolicyRevision >= 0);
