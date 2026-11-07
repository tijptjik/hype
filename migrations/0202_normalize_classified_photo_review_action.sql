-- Consolidate the legacy classified-photo action without changing decision evidence.
-- 0057 first normalizes the older add-all-photo-with-intent alias to this value.
UPDATE task
SET reviewAction = 'added-classified-photos'
WHERE reviewAction = 'added-all-photos-with-intent';
