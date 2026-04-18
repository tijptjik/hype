-- Custom SQL migration file, put your code below! --
-- Source verification date: 2026-04-18
-- Remaining Cloudinary task image found in mirrored production data:
-- image.id = 'UT0dAqN6tZWg'
-- feature.id = 'NmQpfQmGf20j' (Bridges Street Market)
-- task.id = 'T742wmX9kqQU'
--
-- Operational note:
-- Port the backing asset to Cloudflare R2 before applying this migration.
-- This migration only updates database metadata after the asset exists in R2.

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = 'UT0dAqN6tZWg'
  AND cdn = 'cloudinary';
