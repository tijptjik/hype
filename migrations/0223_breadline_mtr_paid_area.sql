-- Refs #194, #180; spec/breadline/proposal/01-places-features.md.
-- Preserve the Breadline project field authored locally on 2026-11-10 on reset.
-- Internal toggle: active for Donors, ignored for Dropoff Points.

-- Fail on conflicting identities rather than attaching the field to another owner.
CREATE TABLE __breadline_mtr_paid_area_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO __breadline_mtr_paid_area_guard
SELECT
  EXISTS (SELECT 1 FROM project WHERE id = 'UMsz5DHb29Lx' AND code = 'breadline')
  AND (SELECT count(*) FROM layer WHERE projectId = 'UMsz5DHb29Lx'
    AND id IN ('1msQMcuqfHrP', 'kin0shUTfrUi')) = 2
  AND NOT EXISTS (SELECT 1 FROM property WHERE id = '4ql4aG0vBWsc'
    AND (key <> 'mtrPaidArea' OR scope <> 'project' OR projectId IS NOT 'UMsz5DHb29Lx'))
  AND NOT EXISTS (SELECT 1 FROM property WHERE key = 'mtrPaidArea'
    AND scope = 'project' AND projectId = 'UMsz5DHb29Lx' AND id <> '4ql4aG0vBWsc');
DROP TABLE __breadline_mtr_paid_area_guard;

-- Seed the existing definition without overwriting later edits on populated databases.
-- Filter before INSERT: BEFORE INSERT catalog guards also run for ON CONFLICT no-ops.
INSERT INTO property (
  id, projectId, scope, type, key, component, isTranslatable,
  isUserContributable, isDefaultEnabled, cardinality, presentation, audience, dataType
) SELECT
  '4ql4aG0vBWsc', 'UMsz5DHb29Lx', 'project', 'classifier', 'mtrPaidArea',
  'ToggleField', 1, 0, 0, 'one', 'text', 'internal', 'text'
WHERE NOT EXISTS (SELECT 1 FROM property WHERE id = '4ql4aG0vBWsc');

INSERT INTO propertyI18n (propertyId, locale, label, labelGen, placeholder, placeholderGen)
SELECT '4ql4aG0vBWsc', 'en', 'MTR Paid Area', 0, 'Is it in the paid area of the MTR?', 0
WHERE NOT EXISTS (
  SELECT 1 FROM propertyI18n WHERE propertyId = '4ql4aG0vBWsc' AND locale = 'en'
);

INSERT INTO projectProperty (projectId, propertyId, rank, isEnabled, isDefaultEnabled)
SELECT 'UMsz5DHb29Lx', '4ql4aG0vBWsc', 5, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM projectProperty
  WHERE projectId = 'UMsz5DHb29Lx' AND propertyId = '4ql4aG0vBWsc');

-- Layer assignments have no unique constraint; update existing rows before filling gaps.
UPDATE layerProperty
SET isVisible = CASE WHEN layerId = '1msQMcuqfHrP' THEN 1 ELSE 0 END,
  isUserContributable = 0
WHERE propertyId = '4ql4aG0vBWsc' AND layerId IN ('1msQMcuqfHrP', 'kin0shUTfrUi')
  AND (isVisible <> CASE WHEN layerId = '1msQMcuqfHrP' THEN 1 ELSE 0 END
    OR isUserContributable <> 0);

INSERT INTO layerProperty (layerId, propertyId, isVisible, isUserContributable)
SELECT id, '4ql4aG0vBWsc', CASE WHEN id = '1msQMcuqfHrP' THEN 1 ELSE 0 END, 0
FROM layer
WHERE id IN ('1msQMcuqfHrP', 'kin0shUTfrUi')
  AND NOT EXISTS (SELECT 1 FROM layerProperty
    WHERE layerId = layer.id AND propertyId = '4ql4aG0vBWsc');
