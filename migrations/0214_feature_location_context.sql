-- Refs #241. New features separate geometry-independent kind, intended context and relation.
-- Existing features and immutable historical content are deliberately not reclassified.
ALTER TABLE feature ADD COLUMN kind TEXT CHECK(kind IS NULL OR kind IN ('object','place','area','route'));
ALTER TABLE feature ADD COLUMN targetContext TEXT CHECK(targetContext IS NULL OR targetContext IN ('building_part','building','premises','infrastructure','street','address','establishment','natural'));
ALTER TABLE feature ADD COLUMN associationRelation TEXT CHECK(associationRelation IS NULL OR associationRelation IN ('locatedAt','represents'));
ALTER TABLE feature ADD COLUMN nameTemplate TEXT CHECK(nameTemplate IS NULL OR json_valid(nameTemplate));
-- Missing associations remain visible as data-quality work; they never block publishing.
DROP TRIGGER IF EXISTS feature_intent_publication_guard;
CREATE INDEX feature_target_context ON feature(layerId,targetContext);

CREATE TRIGGER feature_location_count_insert AFTER INSERT ON featureLocation BEGIN
 UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER feature_location_count_delete AFTER DELETE ON featureLocation BEGIN
 UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
