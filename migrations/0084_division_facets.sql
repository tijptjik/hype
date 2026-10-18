-- Division IDs and registry translations replace the legacy name-based facade.
DROP VIEW IF EXISTS featureNeighbourhood;
DELETE FROM featureCountCache;
UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;

-- Ancestor changes affect facets even when the canonical leaf stays the same.
CREATE TRIGGER division_membership_insert AFTER INSERT ON featureDivisionMembership
WHEN NEW.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_membership_delete AFTER DELETE ON featureDivisionMembership
WHEN OLD.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_membership_update AFTER UPDATE ON featureDivisionMembership
WHEN OLD.selected=1 OR NEW.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;

-- Direct registry translation edits must invalidate cached localized facets too.
CREATE TRIGGER division_translation_insert AFTER INSERT ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_translation_update AFTER UPDATE ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_translation_delete AFTER DELETE ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
