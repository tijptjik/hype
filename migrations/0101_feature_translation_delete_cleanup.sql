-- Repair legacy featureI18n tables that lack the feature foreign key declared in
-- src/lib/db/schema/feature.ts. Refs #213.
-- A trigger avoids rebuilding a table referenced by the search index. It is also
-- harmless on databases that already have ON DELETE CASCADE. Archive updates do
-- not fire it. Run this migration atomically through D1 migrations.
CREATE TRIGGER feature_delete_translations
AFTER DELETE ON feature
BEGIN
  DELETE FROM featureI18n WHERE featureId = OLD.id;
END;

-- Only the 31 reviewed orphan translations are eligible. Preserve translations
-- if their parent has been restored, and leave unrelated orphan records alone.
DELETE FROM featureI18n
WHERE featureId IN (
  '-sBxRrdSnyU4', 'ALusUDEafJEM', 'FlFpXZNizDQ-', 'FyAI_I7PRfdR',
  'XaJ94ElNXEEl', '_i72_4SzLAUp', 'b_zZDU20X6E7', 'lbj6pWE8c7Lo',
  'mN9tR1Rb54zP', 'v4FyUjIq0PrV', 'vwuI4ynpxXTV'
)
AND NOT EXISTS (SELECT 1 FROM feature WHERE feature.id = featureI18n.featureId);
