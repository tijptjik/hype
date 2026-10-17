-- Named SaanSeoi roles replace display-level projections. Membership IDs remain authoritative.

DROP TRIGGER feature_division_projection_move;

DROP TRIGGER feature_count_entry_insert;

DROP TRIGGER feature_count_entry_delete;

DROP TRIGGER feature_count_entry_update;

DROP TRIGGER feature_count_feature_insert;

DROP TRIGGER feature_count_feature_update;

DROP TABLE featureCountEntry;

DROP TABLE featureCountRollup;

DROP INDEX feature_divisionLeafId;

ALTER TABLE feature DROP COLUMN divisionLeafId;

DROP INDEX feature_divisionLevel1Id;

ALTER TABLE feature DROP COLUMN divisionLevel1Id;

DROP INDEX feature_divisionLevel2Id;

ALTER TABLE feature DROP COLUMN divisionLevel2Id;

DROP INDEX feature_divisionLevel3Id;

ALTER TABLE feature DROP COLUMN divisionLevel3Id;

DROP INDEX feature_divisionLevel4Id;

ALTER TABLE feature DROP COLUMN divisionLevel4Id;

DROP INDEX feature_divisionLevel5Id;

ALTER TABLE feature DROP COLUMN divisionLevel5Id;

DROP INDEX feature_divisionLevel6Id;

ALTER TABLE feature DROP COLUMN divisionLevel6Id;

DROP INDEX feature_landformLeafId;

ALTER TABLE feature DROP COLUMN landformLeafId;

ALTER TABLE feature ADD COLUMN countryId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_countryId ON feature(countryId,id);

ALTER TABLE feature ADD COLUMN areaId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_areaId ON feature(areaId,id);

ALTER TABLE feature ADD COLUMN districtId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_districtId ON feature(districtId,id);

ALTER TABLE feature ADD COLUMN townId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_townId ON feature(townId,id);

ALTER TABLE feature ADD COLUMN ruralAreaId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_ruralAreaId ON feature(ruralAreaId,id);

ALTER TABLE feature ADD COLUMN macrohoodId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_macrohoodId ON feature(macrohoodId,id);

ALTER TABLE feature ADD COLUMN neighbourhoodId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_neighbourhoodId ON feature(neighbourhoodId,id);

ALTER TABLE feature ADD COLUMN villageId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_villageId ON feature(villageId,id);

ALTER TABLE feature ADD COLUMN microhoodId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_microhoodId ON feature(microhoodId,id);

ALTER TABLE feature ADD COLUMN hamletId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_hamletId ON feature(hamletId,id);

ALTER TABLE feature ADD COLUMN islandId TEXT REFERENCES divisionDefinition(id);

CREATE INDEX feature_islandId ON feature(islandId,id);

ALTER TABLE feature ADD COLUMN divisionResolution TEXT;

-- Backfill unique roles from selected memberships without network geocoding.
-- Existing definition hierarchies remain available; unknown per-query paths stay null.

UPDATE feature SET countryId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='country'),
  areaId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='area'),
  districtId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='district'),
  townId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='town'),
  ruralAreaId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='rural_area'),
  macrohoodId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='macrohood'),
  neighbourhoodId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='neighbourhood'),
  villageId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='village'),
  microhoodId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='microhood'),
  hamletId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class')='hamlet'),
  islandId=(SELECT CASE WHEN count(*)=1 THEN min(d.id) END FROM featureDivisionMembership m JOIN divisionDefinition d ON d.id=m.divisionId WHERE m.featureId=feature.id AND m.selected=1 AND json_extract(d.attributes,'$.class') IN ('major_island','minor_island','islet') AND NOT EXISTS (
    SELECT 1 FROM featureDivisionMembership other JOIN divisionDefinition child ON child.id=other.divisionId
    WHERE other.featureId=feature.id AND other.selected=1 AND child.id<>d.id
      AND json_extract(child.attributes,'$.class') IN ('major_island','minor_island','islet')
      AND json_array_length(child.attributes,'$.hierarchies.full')>0
      AND NOT EXISTS (SELECT 1 FROM json_each(child.attributes,'$.hierarchies.full') path
        WHERE NOT EXISTS (SELECT 1 FROM json_each(path.value) entry WHERE json_extract(entry.value,'$.id')=d.id))
  ));

CREATE TRIGGER feature_division_projection_move AFTER UPDATE OF geometry ON feature
WHEN OLD.geometry IS NOT NEW.geometry BEGIN
  UPDATE feature SET countryId=NULL, areaId=NULL, districtId=NULL, townId=NULL, ruralAreaId=NULL, macrohoodId=NULL, neighbourhoodId=NULL, villageId=NULL, microhoodId=NULL, hamletId=NULL, islandId=NULL, divisionResolution=NULL WHERE id=NEW.id;
END;

CREATE TABLE featureCountEntry (featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, organisationId TEXT NOT NULL, projectId TEXT NOT NULL, layerId TEXT NOT NULL, isPublished INTEGER NOT NULL, isArchived INTEGER NOT NULL, isDraft INTEGER NOT NULL, isVisitable INTEGER NOT NULL, isIntangible INTEGER NOT NULL, countryId TEXT NOT NULL, areaId TEXT NOT NULL, districtId TEXT NOT NULL, townId TEXT NOT NULL, ruralAreaId TEXT NOT NULL, macrohoodId TEXT NOT NULL, neighbourhoodId TEXT NOT NULL, villageId TEXT NOT NULL, microhoodId TEXT NOT NULL, hamletId TEXT NOT NULL, islandId TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE featureCountRollup (organisationId TEXT NOT NULL, projectId TEXT NOT NULL, layerId TEXT NOT NULL, isPublished INTEGER NOT NULL, isArchived INTEGER NOT NULL, isDraft INTEGER NOT NULL, isVisitable INTEGER NOT NULL, isIntangible INTEGER NOT NULL, countryId TEXT NOT NULL, areaId TEXT NOT NULL, districtId TEXT NOT NULL, townId TEXT NOT NULL, ruralAreaId TEXT NOT NULL, macrohoodId TEXT NOT NULL, neighbourhoodId TEXT NOT NULL, villageId TEXT NOT NULL, microhoodId TEXT NOT NULL, hamletId TEXT NOT NULL, islandId TEXT NOT NULL, totalCount INTEGER NOT NULL CHECK(totalCount>0), PRIMARY KEY(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId)) WITHOUT ROWID;

CREATE INDEX feature_count_rollup_layer_idx ON featureCountRollup(layerId,isDraft,isPublished,isArchived);

CREATE INDEX feature_count_rollup_visibility_idx ON featureCountRollup(isDraft,isPublished,isArchived,layerId);

CREATE TRIGGER feature_count_entry_insert AFTER INSERT ON featureCountEntry BEGIN
  INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.countryId, NEW.areaId, NEW.districtId, NEW.townId, NEW.ruralAreaId, NEW.macrohoodId, NEW.neighbourhoodId, NEW.villageId, NEW.microhoodId, NEW.hamletId, NEW.islandId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) DO UPDATE SET totalCount=totalCount+1;
END;

CREATE TRIGGER feature_count_entry_delete AFTER DELETE ON featureCountEntry BEGIN
  DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount=1;
  UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount>1;
END;

CREATE TRIGGER feature_count_entry_update AFTER UPDATE ON featureCountEntry WHEN OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.countryId IS NOT NEW.countryId OR OLD.areaId IS NOT NEW.areaId OR OLD.districtId IS NOT NEW.districtId OR OLD.townId IS NOT NEW.townId OR OLD.ruralAreaId IS NOT NEW.ruralAreaId OR OLD.macrohoodId IS NOT NEW.macrohoodId OR OLD.neighbourhoodId IS NOT NEW.neighbourhoodId OR OLD.villageId IS NOT NEW.villageId OR OLD.microhoodId IS NOT NEW.microhoodId OR OLD.hamletId IS NOT NEW.hamletId OR OLD.islandId IS NOT NEW.islandId BEGIN
  DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount=1;
  UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount>1;
  INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.countryId, NEW.areaId, NEW.districtId, NEW.townId, NEW.ruralAreaId, NEW.macrohoodId, NEW.neighbourhoodId, NEW.villageId, NEW.microhoodId, NEW.hamletId, NEW.islandId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) DO UPDATE SET totalCount=totalCount+1;
END;

CREATE TRIGGER feature_count_feature_insert AFTER INSERT ON feature BEGIN
  INSERT INTO featureCountEntry(featureId,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) VALUES(NEW.id,NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, coalesce(NEW.countryId,''), coalesce(NEW.areaId,''), coalesce(NEW.districtId,''), coalesce(NEW.townId,''), coalesce(NEW.ruralAreaId,''), coalesce(NEW.macrohoodId,''), coalesce(NEW.neighbourhoodId,''), coalesce(NEW.villageId,''), coalesce(NEW.microhoodId,''), coalesce(NEW.hamletId,''), coalesce(NEW.islandId,''));
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER feature_count_feature_update AFTER UPDATE OF id,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId ON feature WHEN OLD.id IS NOT NEW.id OR OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.countryId IS NOT NEW.countryId OR OLD.areaId IS NOT NEW.areaId OR OLD.districtId IS NOT NEW.districtId OR OLD.townId IS NOT NEW.townId OR OLD.ruralAreaId IS NOT NEW.ruralAreaId OR OLD.macrohoodId IS NOT NEW.macrohoodId OR OLD.neighbourhoodId IS NOT NEW.neighbourhoodId OR OLD.villageId IS NOT NEW.villageId OR OLD.microhoodId IS NOT NEW.microhoodId OR OLD.hamletId IS NOT NEW.hamletId OR OLD.islandId IS NOT NEW.islandId BEGIN
  UPDATE featureCountEntry SET organisationId=NEW.organisationId, projectId=NEW.projectId, layerId=NEW.layerId, isPublished=NEW.isPublished, isArchived=NEW.isArchived, isDraft=NEW.isDraft, isVisitable=NEW.isVisitable, isIntangible=NEW.isIntangible, countryId=coalesce(NEW.countryId,''), areaId=coalesce(NEW.areaId,''), districtId=coalesce(NEW.districtId,''), townId=coalesce(NEW.townId,''), ruralAreaId=coalesce(NEW.ruralAreaId,''), macrohoodId=coalesce(NEW.macrohoodId,''), neighbourhoodId=coalesce(NEW.neighbourhoodId,''), villageId=coalesce(NEW.villageId,''), microhoodId=coalesce(NEW.microhoodId,''), hamletId=coalesce(NEW.hamletId,''), islandId=coalesce(NEW.islandId,'') WHERE featureId=NEW.id;
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;

INSERT INTO featureCountEntry(featureId,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) SELECT id,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, coalesce(countryId,''), coalesce(areaId,''), coalesce(districtId,''), coalesce(townId,''), coalesce(ruralAreaId,''), coalesce(macrohoodId,''), coalesce(neighbourhoodId,''), coalesce(villageId,''), coalesce(microhoodId,''), coalesce(hamletId,''), coalesce(islandId,'') FROM feature;

DELETE FROM featureCountCache;

UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
