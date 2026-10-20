-- Restore the missing genre mapping on ELN editions with existing genre values.
-- Preserve explicit visibility choices and do not make genre publicly editable.
INSERT INTO layerProperty (layerId, propertyId, isVisible, isUserContributable)
SELECT DISTINCT f.layerId, p.id, 1, 0
FROM feature f
JOIN featureProperty fp ON fp.featureId = f.id
JOIN property p ON p.id = fp.propertyId
JOIN layer l ON l.id = f.layerId
WHERE p.id = 'ROKJk1yKoRyh'
  AND p.projectId = 'vGBvWfSZNELM'
  AND l.projectId = p.projectId
  AND NOT EXISTS (
    SELECT 1 FROM layerProperty lp
    WHERE lp.layerId = f.layerId AND lp.propertyId = p.id
  );
