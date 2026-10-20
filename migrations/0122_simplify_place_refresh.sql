-- Refs #194. Canonical refresh owns its outcomes; publisher diagnostics stay offline.
-- Preserve existing per-Feature receipts before removing the redundant receipt table.
ALTER TABLE placeRefreshItem ADD COLUMN outcomes TEXT NOT NULL DEFAULT '{}'
  CHECK(json_valid(outcomes) AND json_type(outcomes)='object');
UPDATE placeRefreshItem SET outcomes=coalesce((
  SELECT json_group_object(featureId,json_object(
    'projectId',projectId,'proposalId',proposalId,'reason',reason,
    'outcome',outcome,'geometryChanged',geometryChanged))
  FROM placeRefreshFeature f
  WHERE f.runId=placeRefreshItem.runId AND f.placeId=placeRefreshItem.placeId
),'{}');
CREATE TABLE __place_refresh_simplification_guard(valid INTEGER CHECK(valid=1));
INSERT INTO __place_refresh_simplification_guard
SELECT (SELECT count(*) FROM placeRefreshFeature)=
  (SELECT count(*) FROM placeRefreshItem,json_each(placeRefreshItem.outcomes));
DROP TABLE __place_refresh_simplification_guard;
DROP TABLE placeRefreshFeature;
-- These diagnostic publisher pages do not drive canonical adoption. Retain the
-- pre-migration backup for historical diagnostics, rather than another live pipeline.
DROP TABLE IF EXISTS placeSourceEvidenceId;
DROP TABLE IF EXISTS placeSourcePage;
DROP TABLE IF EXISTS placeSourceComparison;
DROP TABLE IF EXISTS placeSourceTransition;
