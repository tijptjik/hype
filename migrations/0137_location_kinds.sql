-- Refs #194: widen the shared identity without replacing IDs, revisions or associations.
-- The physical place table remains the existing lifecycle store during this first slice.
ALTER TABLE place ADD COLUMN kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (kind IN ('unknown', 'establishment', 'building', 'natural'));

-- A canonical Places association supplies entity-type evidence. Unmatched legacy Features
-- remain unknown; manual/unresolved matching intent does not establish entity kind.
UPDATE place SET kind = 'establishment' WHERE ssId IS NOT NULL AND state = 'linked';

-- Breadline donor imports carry explicit establishment evidence; drop-points and other
-- unresolved Feature baselines are not classified from their names or coordinates.
UPDATE place SET kind = 'establishment' WHERE kind = 'unknown' AND EXISTS (
  SELECT 1 FROM placeRevision r WHERE r.placeId = place.id
    AND json_extract(r.payload, '$.kind') = 'breadline-place-import'
    AND json_extract(r.payload, '$.sourceTable') = 'donors'
);
