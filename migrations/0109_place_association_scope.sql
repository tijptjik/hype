-- Enforce private baseline scope at the write boundary, including ancestry changes.
-- Refs #194; spec/breadline/proposal/01-places-features.md.
-- Existing invalid associations must be resolved explicitly before installing guards.
CREATE TABLE place_scope_validation (valid INTEGER CHECK (valid = 1));
INSERT INTO place_scope_validation(valid)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM featurePlace fp
  JOIN feature f ON f.id = fp.featureId
  JOIN place p ON p.id = fp.placeId
  WHERE f.isDraft IS NOT 0 OR (p.ownerProjectId IS NOT NULL AND p.ownerProjectId IS NOT f.projectId)
) THEN 0 ELSE 1 END;
DROP TABLE place_scope_validation;

CREATE TRIGGER feature_place_scope_insert BEFORE INSERT ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0
    AND (p.ownerProjectId IS NULL OR p.ownerProjectId = f.projectId)
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

CREATE TRIGGER feature_place_scope_update BEFORE UPDATE ON featurePlace
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN place p ON p.id = NEW.placeId
  WHERE f.id = NEW.featureId AND f.isDraft = 0
    AND (p.ownerProjectId IS NULL OR p.ownerProjectId = f.projectId)
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

-- Moving a Feature must not carry a private baseline into another project.
CREATE TRIGGER feature_place_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featurePlace fp JOIN place p ON p.id = fp.placeId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.ownerProjectId IS NOT NULL AND p.ownerProjectId IS NOT NEW.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;

-- Ownership changes cannot invalidate associations that were previously valid.
CREATE TRIGGER feature_place_owner_scope BEFORE UPDATE OF ownerProjectId ON place
WHEN NEW.ownerProjectId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featurePlace fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.placeId = OLD.id AND f.projectId IS NOT NEW.ownerProjectId
)
BEGIN SELECT RAISE(ABORT, 'Feature Place scope mismatch'); END;
