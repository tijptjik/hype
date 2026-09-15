-- Replace duplicated membership count bins with the canonical feature count tuple.
-- Candidate membership and fenced refresh state remain for safe invalidation/retries.
DROP VIEW featureDivisionCounts;
DROP TRIGGER feature_division_count_insert;
DROP TRIGGER feature_division_count_delete;
DROP TRIGGER feature_division_count_update;
DROP TRIGGER feature_division_scope;
DROP TABLE featureDivisionCountRollup;
ALTER TABLE featureDivisionMembership DROP COLUMN bin;

-- Only IDs live on features; all source names and variants belong to the mirror.
CREATE TABLE divisionI18n (
  divisionId TEXT NOT NULL REFERENCES divisionDefinition(id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale TEXT NOT NULL,
  name TEXT,
  namedValues TEXT NOT NULL,
  PRIMARY KEY(divisionId,locale)
) WITHOUT ROWID;
CREATE INDEX division_i18n_name ON divisionI18n(locale,name,divisionId);
CREATE TRIGGER division_i18n_insert AFTER INSERT ON divisionDefinition BEGIN
  INSERT INTO divisionI18n SELECT NEW.id,key,json_extract(value,'$.name'),value
  FROM json_each(NEW.attributes,'$.names');
END;
CREATE TRIGGER division_i18n_update AFTER UPDATE OF attributes ON divisionDefinition
WHEN OLD.attributes IS NOT NEW.attributes BEGIN
  DELETE FROM divisionI18n WHERE divisionId=NEW.id;
  INSERT INTO divisionI18n SELECT NEW.id,key,json_extract(value,'$.name'),value
  FROM json_each(NEW.attributes,'$.names');
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
INSERT INTO divisionI18n SELECT d.id,n.key,json_extract(n.value,'$.name'),n.value
FROM divisionDefinition d,json_each(d.attributes,'$.names') n;
ALTER TABLE feature ADD COLUMN divisionLeafId TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLeafId ON feature(divisionLeafId,id);
ALTER TABLE feature ADD COLUMN divisionLevel1Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel1Id ON feature(divisionLevel1Id,id);
ALTER TABLE feature ADD COLUMN divisionLevel2Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel2Id ON feature(divisionLevel2Id,id);
ALTER TABLE feature ADD COLUMN divisionLevel3Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel3Id ON feature(divisionLevel3Id,id);
ALTER TABLE feature ADD COLUMN divisionLevel4Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel4Id ON feature(divisionLevel4Id,id);
ALTER TABLE feature ADD COLUMN divisionLevel5Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel5Id ON feature(divisionLevel5Id,id);
ALTER TABLE feature ADD COLUMN divisionLevel6Id TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_divisionLevel6Id ON feature(divisionLevel6Id,id);
ALTER TABLE feature ADD COLUMN landformLeafId TEXT REFERENCES divisionDefinition(id);
CREATE INDEX feature_landformLeafId ON feature(landformLeafId,id);

-- Coordinate changes clear selected projections in the same transaction as memberships.
CREATE TRIGGER feature_division_projection_move AFTER UPDATE OF geometry ON feature
WHEN OLD.geometry IS NOT NEW.geometry BEGIN
  UPDATE feature SET divisionLeafId=NULL, divisionLevel1Id=NULL, divisionLevel2Id=NULL, divisionLevel3Id=NULL, divisionLevel4Id=NULL, divisionLevel5Id=NULL, divisionLevel6Id=NULL, landformLeafId=NULL WHERE id=NEW.id;
END;
-- Re-resolve pre-existing worker output through the current JSON:API adapter.
INSERT INTO featureDivisionJob(featureId) SELECT id FROM feature WHERE true
ON CONFLICT(featureId) DO UPDATE SET generation=generation+1,attempts=0,retryAt=0,lastError=NULL;

-- Retain the legacy label facade for existing UI consumers; it matches selected neighbourhood memberships.
DROP TRIGGER feature_neighbourhood_i18n_insert;
DROP TRIGGER feature_neighbourhood_i18n_delete;
DROP TRIGGER feature_neighbourhood_i18n_update;
DROP TABLE featureNeighbourhood;
CREATE VIEW featureNeighbourhood AS
SELECT m.featureId,i.name AS neighbourhood FROM featureDivisionMembership m
JOIN divisionDefinition d ON d.id=m.divisionId
JOIN divisionI18n i ON i.divisionId=m.divisionId AND i.locale='en'
WHERE m.selected=1 AND json_extract(d.attributes,'$.class')='neighbourhood'
  AND i.name IS NOT NULL;
DROP TRIGGER feature_count_entry_insert;
DROP TRIGGER feature_count_entry_delete;
DROP TRIGGER feature_count_entry_update;
DROP TRIGGER feature_count_feature_insert;
DROP TRIGGER feature_count_feature_update;
DROP TRIGGER feature_count_i18n_insert;
DROP TRIGGER feature_count_i18n_delete;
DROP TRIGGER feature_count_i18n_membership_update;
DROP TABLE featureCountEntry;
DROP TABLE featureCountRollup;
CREATE TABLE featureCountEntry (featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
organisationId TEXT NOT NULL, projectId TEXT NOT NULL, layerId TEXT NOT NULL, isPublished INTEGER NOT NULL, isArchived INTEGER NOT NULL, isDraft INTEGER NOT NULL, isVisitable INTEGER NOT NULL, isIntangible INTEGER NOT NULL, divisionLeafId TEXT NOT NULL, divisionLevel1Id TEXT NOT NULL, divisionLevel2Id TEXT NOT NULL, divisionLevel3Id TEXT NOT NULL, divisionLevel4Id TEXT NOT NULL, divisionLevel5Id TEXT NOT NULL, divisionLevel6Id TEXT NOT NULL, landformLeafId TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE featureCountRollup (
organisationId TEXT NOT NULL, projectId TEXT NOT NULL, layerId TEXT NOT NULL, isPublished INTEGER NOT NULL, isArchived INTEGER NOT NULL, isDraft INTEGER NOT NULL, isVisitable INTEGER NOT NULL, isIntangible INTEGER NOT NULL, divisionLeafId TEXT NOT NULL, divisionLevel1Id TEXT NOT NULL, divisionLevel2Id TEXT NOT NULL, divisionLevel3Id TEXT NOT NULL, divisionLevel4Id TEXT NOT NULL, divisionLevel5Id TEXT NOT NULL, divisionLevel6Id TEXT NOT NULL, landformLeafId TEXT NOT NULL,totalCount INTEGER NOT NULL CHECK(totalCount>0),PRIMARY KEY(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId)) WITHOUT ROWID;
CREATE INDEX feature_count_rollup_layer_idx ON featureCountRollup(layerId,isDraft,isPublished,isArchived);
CREATE INDEX feature_count_rollup_visibility_idx ON featureCountRollup(isDraft,isPublished,isArchived,layerId);
CREATE TRIGGER feature_count_entry_insert AFTER INSERT ON featureCountEntry BEGIN INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.divisionLeafId, NEW.divisionLevel1Id, NEW.divisionLevel2Id, NEW.divisionLevel3Id, NEW.divisionLevel4Id, NEW.divisionLevel5Id, NEW.divisionLevel6Id, NEW.landformLeafId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId) DO UPDATE SET totalCount=totalCount+1; END;
CREATE TRIGGER feature_count_entry_delete AFTER DELETE ON featureCountEntry BEGIN DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND divisionLeafId=OLD.divisionLeafId AND divisionLevel1Id=OLD.divisionLevel1Id AND divisionLevel2Id=OLD.divisionLevel2Id AND divisionLevel3Id=OLD.divisionLevel3Id AND divisionLevel4Id=OLD.divisionLevel4Id AND divisionLevel5Id=OLD.divisionLevel5Id AND divisionLevel6Id=OLD.divisionLevel6Id AND landformLeafId=OLD.landformLeafId AND totalCount=1;
UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND divisionLeafId=OLD.divisionLeafId AND divisionLevel1Id=OLD.divisionLevel1Id AND divisionLevel2Id=OLD.divisionLevel2Id AND divisionLevel3Id=OLD.divisionLevel3Id AND divisionLevel4Id=OLD.divisionLevel4Id AND divisionLevel5Id=OLD.divisionLevel5Id AND divisionLevel6Id=OLD.divisionLevel6Id AND landformLeafId=OLD.landformLeafId AND totalCount>1; END;
CREATE TRIGGER feature_count_entry_update AFTER UPDATE ON featureCountEntry WHEN OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.divisionLeafId IS NOT NEW.divisionLeafId OR OLD.divisionLevel1Id IS NOT NEW.divisionLevel1Id OR OLD.divisionLevel2Id IS NOT NEW.divisionLevel2Id OR OLD.divisionLevel3Id IS NOT NEW.divisionLevel3Id OR OLD.divisionLevel4Id IS NOT NEW.divisionLevel4Id OR OLD.divisionLevel5Id IS NOT NEW.divisionLevel5Id OR OLD.divisionLevel6Id IS NOT NEW.divisionLevel6Id OR OLD.landformLeafId IS NOT NEW.landformLeafId BEGIN DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND divisionLeafId=OLD.divisionLeafId AND divisionLevel1Id=OLD.divisionLevel1Id AND divisionLevel2Id=OLD.divisionLevel2Id AND divisionLevel3Id=OLD.divisionLevel3Id AND divisionLevel4Id=OLD.divisionLevel4Id AND divisionLevel5Id=OLD.divisionLevel5Id AND divisionLevel6Id=OLD.divisionLevel6Id AND landformLeafId=OLD.landformLeafId AND totalCount=1;
UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND divisionLeafId=OLD.divisionLeafId AND divisionLevel1Id=OLD.divisionLevel1Id AND divisionLevel2Id=OLD.divisionLevel2Id AND divisionLevel3Id=OLD.divisionLevel3Id AND divisionLevel4Id=OLD.divisionLevel4Id AND divisionLevel5Id=OLD.divisionLevel5Id AND divisionLevel6Id=OLD.divisionLevel6Id AND landformLeafId=OLD.landformLeafId AND totalCount>1;
INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.divisionLeafId, NEW.divisionLevel1Id, NEW.divisionLevel2Id, NEW.divisionLevel3Id, NEW.divisionLevel4Id, NEW.divisionLevel5Id, NEW.divisionLevel6Id, NEW.landformLeafId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId) DO UPDATE SET totalCount=totalCount+1; END;
CREATE TRIGGER feature_count_feature_insert AFTER INSERT ON feature BEGIN INSERT INTO featureCountEntry(featureId,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId) VALUES(NEW.id,NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, coalesce(NEW.divisionLeafId,''), coalesce(NEW.divisionLevel1Id,''), coalesce(NEW.divisionLevel2Id,''), coalesce(NEW.divisionLevel3Id,''), coalesce(NEW.divisionLevel4Id,''), coalesce(NEW.divisionLevel5Id,''), coalesce(NEW.divisionLevel6Id,''), coalesce(NEW.landformLeafId,'')); UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER feature_count_feature_update AFTER UPDATE OF id,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId ON feature WHEN OLD.id IS NOT NEW.id OR OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.divisionLeafId IS NOT NEW.divisionLeafId OR OLD.divisionLevel1Id IS NOT NEW.divisionLevel1Id OR OLD.divisionLevel2Id IS NOT NEW.divisionLevel2Id OR OLD.divisionLevel3Id IS NOT NEW.divisionLevel3Id OR OLD.divisionLevel4Id IS NOT NEW.divisionLevel4Id OR OLD.divisionLevel5Id IS NOT NEW.divisionLevel5Id OR OLD.divisionLevel6Id IS NOT NEW.divisionLevel6Id OR OLD.landformLeafId IS NOT NEW.landformLeafId BEGIN UPDATE featureCountEntry SET organisationId=NEW.organisationId, projectId=NEW.projectId, layerId=NEW.layerId, isPublished=NEW.isPublished, isArchived=NEW.isArchived, isDraft=NEW.isDraft, isVisitable=NEW.isVisitable, isIntangible=NEW.isIntangible, divisionLeafId=coalesce(NEW.divisionLeafId,''), divisionLevel1Id=coalesce(NEW.divisionLevel1Id,''), divisionLevel2Id=coalesce(NEW.divisionLevel2Id,''), divisionLevel3Id=coalesce(NEW.divisionLevel3Id,''), divisionLevel4Id=coalesce(NEW.divisionLevel4Id,''), divisionLevel5Id=coalesce(NEW.divisionLevel5Id,''), divisionLevel6Id=coalesce(NEW.divisionLevel6Id,''), landformLeafId=coalesce(NEW.landformLeafId,'') WHERE featureId=NEW.id; UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
-- Translation changes still invalidate text-search counts, independently of division identity.
CREATE TRIGGER feature_count_i18n_insert AFTER INSERT ON featureI18n BEGIN UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
-- Translation changes still invalidate text-search counts, independently of division identity.
CREATE TRIGGER feature_count_i18n_delete AFTER DELETE ON featureI18n BEGIN UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
INSERT INTO featureCountEntry(featureId,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, divisionLeafId, divisionLevel1Id, divisionLevel2Id, divisionLevel3Id, divisionLevel4Id, divisionLevel5Id, divisionLevel6Id, landformLeafId) SELECT id,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, coalesce(divisionLeafId,''), coalesce(divisionLevel1Id,''), coalesce(divisionLevel2Id,''), coalesce(divisionLevel3Id,''), coalesce(divisionLevel4Id,''), coalesce(divisionLevel5Id,''), coalesce(divisionLevel6Id,''), coalesce(landformLeafId,'') FROM feature;
DELETE FROM featureCountCache;
UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
