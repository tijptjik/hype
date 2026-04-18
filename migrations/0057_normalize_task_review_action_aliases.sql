-- Normalize legacy task review action aliases to the current canonical values.

UPDATE task
SET reviewAction = 'added-all-photos'
WHERE reviewAction = 'add-all-photo';

UPDATE task
SET reviewAction = 'added-all-photos-with-intent'
WHERE reviewAction = 'add-all-photo-with-intent';
