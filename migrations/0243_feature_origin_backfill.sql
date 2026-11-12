-- User-confirmed historical creation channels, matched by stable organisation codes.
-- Existing explicit provenance is never replaced. Future creations use their actual entry point.
INSERT INTO featureOrigin(featureId,origin,originId,recordedAt,recordedBy)
SELECT f.id,
  CASE WHEN o.code='hkghostsigns' AND NOT EXISTS (
    SELECT 1 FROM organisationRole r WHERE r.organisationId=f.organisationId
      AND r.userId=f.contributorId AND r.role IN ('member','owner')
  ) THEN 'app_contribution' ELSE 'admin_contribution' END,
  NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL
FROM feature f JOIN organisation o ON o.id=f.organisationId
WHERE o.code IN ('hkfoodworks','hkghostsigns','cityrecorder','eunic','cmef')
ON CONFLICT(featureId) DO NOTHING;
