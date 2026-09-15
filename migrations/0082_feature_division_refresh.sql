-- Durable release checkpoint, fenced worker lease, and resumable change-page scanning.
CREATE TABLE divisionRefresh (
  id INTEGER PRIMARY KEY CHECK(id=1),
  appliedRelease TEXT,
  targetRelease TEXT,
  targetReleaseId TEXT,
  comparisonId TEXT,
  cursor TEXT,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK(phase IN ('idle','changes','scan','geocode')),
  checkedMonth TEXT,
  lease TEXT,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
INSERT INTO divisionRefresh(id) VALUES(1);
CREATE TABLE divisionRefreshChange (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  featureCursor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE divisionDefinition (
  id TEXT PRIMARY KEY,
  apiReleaseSet TEXT NOT NULL,
  attributes TEXT NOT NULL
);
-- Canonical and non-canonical memberships are retained for targeted refreshes.
CREATE TABLE featureDivisionMembership (
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  divisionId TEXT NOT NULL,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  bin TEXT NOT NULL,
  PRIMARY KEY(featureId,divisionId)
);
CREATE INDEX feature_division_membership_division ON featureDivisionMembership(divisionId,featureId);
CREATE TABLE featureDivisionCountRollup (
  divisionId TEXT NOT NULL,
  bin TEXT NOT NULL,
  totalCount INTEGER NOT NULL CHECK(totalCount>0),
  PRIMARY KEY(divisionId,bin)
);
CREATE TABLE featureDivisionJob (
  featureId TEXT PRIMARY KEY REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  generation INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
CREATE INDEX feature_division_job_retry ON featureDivisionJob(retryAt,featureId);
CREATE INDEX feature_division_coordinate ON feature(
  json_extract(geometry,'$.coordinates[0]'),
  json_extract(geometry,'$.coordinates[1]')
) WHERE json_extract(geometry,'$.type')='Point';

CREATE TRIGGER feature_division_count_insert AFTER INSERT ON featureDivisionMembership WHEN NEW.selected=1 BEGIN
  INSERT INTO featureDivisionCountRollup VALUES(NEW.divisionId,NEW.bin,1)
  ON CONFLICT(divisionId,bin) DO UPDATE SET totalCount=totalCount+1;
END;
CREATE TRIGGER feature_division_count_delete AFTER DELETE ON featureDivisionMembership WHEN OLD.selected=1 BEGIN
  DELETE FROM featureDivisionCountRollup WHERE divisionId=OLD.divisionId AND bin=OLD.bin AND totalCount=1;
  UPDATE featureDivisionCountRollup SET totalCount=totalCount-1 WHERE divisionId=OLD.divisionId AND bin=OLD.bin AND totalCount>1;
END;
CREATE TRIGGER feature_division_count_update AFTER UPDATE OF bin,selected ON featureDivisionMembership
WHEN OLD.bin IS NOT NEW.bin OR OLD.selected IS NOT NEW.selected BEGIN
  DELETE FROM featureDivisionCountRollup WHERE OLD.selected=1 AND divisionId=OLD.divisionId AND bin=OLD.bin AND totalCount=1;
  UPDATE featureDivisionCountRollup SET totalCount=totalCount-1 WHERE OLD.selected=1 AND divisionId=OLD.divisionId AND bin=OLD.bin AND totalCount>1;
  INSERT INTO featureDivisionCountRollup SELECT NEW.divisionId,NEW.bin,1 WHERE NEW.selected=1
  ON CONFLICT(divisionId,bin) DO UPDATE SET totalCount=totalCount+1;
END;
CREATE TRIGGER feature_division_scope AFTER UPDATE OF organisationId,projectId,layerId,isPublished,isArchived,isDraft,isVisitable,isIntangible ON feature BEGIN
  UPDATE featureDivisionMembership SET bin=(SELECT json_array(organisationId,projectId,layerId,isPublished,isArchived,isDraft,isVisitable,isIntangible) FROM feature WHERE id=NEW.id) WHERE featureId=NEW.id;
END;
CREATE TRIGGER feature_division_create AFTER INSERT ON feature BEGIN
  INSERT INTO featureDivisionJob(featureId) VALUES(NEW.id);
END;
CREATE TRIGGER feature_division_move AFTER UPDATE OF geometry ON feature WHEN OLD.geometry IS NOT NEW.geometry BEGIN
  -- Old coordinates must stop contributing immediately, including moves to non-point geometry.
  DELETE FROM featureDivisionMembership WHERE featureId=NEW.id;
  INSERT INTO featureDivisionJob(featureId) VALUES(NEW.id)
  ON CONFLICT(featureId) DO UPDATE SET generation=generation+1,attempts=0,retryAt=0,lastError=NULL;
END;
INSERT INTO featureDivisionJob(featureId) SELECT id FROM feature;

-- One selected division contributes once. Never sum levels or landform kinds together.
CREATE VIEW featureDivisionCounts AS SELECT r.divisionId,r.totalCount,
  json_extract(r.bin,'$[0]') AS organisationId,
  json_extract(r.bin,'$[1]') AS projectId,
  json_extract(r.bin,'$[2]') AS layerId,
  json_extract(r.bin,'$[3]') AS isPublished,
  json_extract(r.bin,'$[4]') AS isArchived,
  json_extract(r.bin,'$[5]') AS isDraft,
  json_extract(r.bin,'$[6]') AS isVisitable,
  json_extract(r.bin,'$[7]') AS isIntangible,
  json_extract(d.attributes,'$.level') AS level,
  json_extract(d.attributes,'$.category') AS category,
  json_extract(d.attributes,'$.class') AS class
FROM featureDivisionCountRollup r LEFT JOIN divisionDefinition d ON d.id=r.divisionId;
