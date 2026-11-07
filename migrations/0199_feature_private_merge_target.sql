-- A merge chooses an identity, independently of its current public visibility.
-- Public readers activate its redirect only while the surviving Feature is visible.
DROP TRIGGER feature_head_redirect_target;
CREATE TRIGGER feature_head_redirect_target BEFORE UPDATE ON featureRevisionHead
WHEN NEW.state='merged' AND NOT EXISTS (
  SELECT 1 FROM featureRevisionHead WHERE featureId=NEW.redirectFeatureId AND state='active'
)
BEGIN SELECT RAISE(ABORT,'merge survivor must be an active feature'); END;
