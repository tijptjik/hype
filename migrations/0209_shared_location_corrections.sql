-- Hype-wide corrections preserve original publisher evidence and immutable editor attribution.
CREATE TABLE IF NOT EXISTS locationSharedRevision (
  id TEXT PRIMARY KEY NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  previousRevisionId TEXT UNIQUE REFERENCES locationSharedRevision(id) ON DELETE RESTRICT,
  sourceRevisionId TEXT NOT NULL REFERENCES locationRevision(id) ON DELETE RESTRICT,
  corrections TEXT NOT NULL CHECK(json_valid(corrections)),
  actorId TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK(json_valid(provenance)),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS location_shared_history ON locationSharedRevision(locationId,createdAt);
CREATE UNIQUE INDEX IF NOT EXISTS location_shared_root ON locationSharedRevision(locationId) WHERE previousRevisionId IS NULL;
CREATE VIEW IF NOT EXISTS locationSharedHead AS
SELECT r.* FROM locationSharedRevision r WHERE NOT EXISTS
(SELECT 1 FROM locationSharedRevision n WHERE n.previousRevisionId=r.id);
CREATE TRIGGER IF NOT EXISTS location_shared_scope BEFORE INSERT ON locationSharedRevision BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM locationRevision s JOIN location l ON l.id=s.locationId
    WHERE s.id=NEW.sourceRevisionId AND l.id=NEW.locationId AND l.state!='redirect')
    THEN RAISE(ABORT,'Invalid shared correction source') END;
  SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM locationSharedHead h WHERE h.id=NEW.previousRevisionId AND h.locationId=NEW.locationId)
    THEN RAISE(ABORT,'Stale shared correction head') END;
END;
CREATE TRIGGER IF NOT EXISTS location_shared_immutable_update BEFORE UPDATE ON locationSharedRevision BEGIN
  SELECT RAISE(ABORT,'Shared correction history is immutable');
END;
CREATE TRIGGER IF NOT EXISTS location_shared_immutable_delete BEFORE DELETE ON locationSharedRevision BEGIN
  SELECT RAISE(ABORT,'Shared correction history is immutable');
END;

-- Adopt the latest existing shared accessibility observation without rewriting its retained history.
INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance,createdAt)
SELECT 'accessibility:'||a.id,a.locationId,NULL,a.locationRevisionId,
 json_object('accessibility',json_object(
   'original',json_object('present',json(CASE WHEN json_type(r.facts,'$.common.accessibility') IS NOT NULL OR json_type(r.facts,'$.accessibility') IS NOT NULL THEN 'true' ELSE 'false' END),
      'value',json(COALESCE(json_extract(r.facts,'$.common.accessibility'),json_extract(r.facts,'$.accessibility'),'null'))),
   'choice',json_object('mode','override','value',json(a.valuesJson)),
   'sourceRevisionId',a.locationRevisionId,'actorId',a.actorId,'editedAt',a.recordedAt)),
 a.actorId,json_object('kind','accessibility-migration','observationId',a.id),a.recordedAt
FROM locationAccessibilityHead a JOIN locationRevision r ON r.id=a.locationRevisionId
JOIN location l ON l.id=a.locationId AND l.state!='redirect'
WHERE NOT EXISTS(SELECT 1 FROM locationSharedRevision s WHERE s.locationId=a.locationId);

-- Every shared revision schedules bounded adoption using existing project policy and task review.
CREATE TRIGGER IF NOT EXISTS location_shared_refresh AFTER INSERT ON locationSharedRevision BEGIN
  INSERT INTO locationRefreshItem(runId,locationId,ssId,revisionId,status,origin,actorId)
  VALUES('shared:'||NEW.id,NEW.locationId,NULL,NEW.sourceRevisionId,'pending','local',NEW.actorId);
END;
INSERT OR IGNORE INTO locationRefreshItem(runId,locationId,ssId,revisionId,status,origin,actorId)
SELECT 'shared:'||id,locationId,NULL,sourceRevisionId,'pending','local',actorId FROM locationSharedHead;

-- Rejection applies to the precise shared evidence assessed, not every future correction.
DROP INDEX IF EXISTS location_adoption_candidate;
CREATE UNIQUE INDEX location_adoption_candidate ON locationAdoptionProposal(
 featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,
 policyRevision,organisationRevision,COALESCE(occupancyRevisionId,''),COALESCE(addressRevisionId,''),
 COALESCE(layerId,''),COALESCE(layerPolicyRevision,-1),COALESCE(json_extract(evidence,'$.placement'),''),
 COALESCE(json_extract(evidence,'$.sharedRevision'),''));
