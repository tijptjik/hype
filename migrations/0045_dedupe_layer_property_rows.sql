PRAGMA foreign_keys=ON;

-- Repair duplicate layerProperty rows and prevent the same (layerId, propertyId)
-- pair from being inserted again. Duplicate layer-property assignments surface as
-- duplicate feature field definitions in admin forms.

DELETE FROM "layerProperty"
WHERE rowid IN (
  SELECT duplicate_rowid
  FROM (
    SELECT
      rowid AS duplicate_rowid,
      ROW_NUMBER() OVER (
        PARTITION BY "layerId", "propertyId"
        ORDER BY rowid ASC
      ) AS duplicate_index
    FROM "layerProperty"
  )
  WHERE duplicate_index > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "layerProperty_layerId_propertyId_idx"
ON "layerProperty" ("layerId", "propertyId");
