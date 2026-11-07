-- Refs #194. Pre-release Location/Address contract correction.
-- Source payloads, raw API responses, identifiers and revision hashes remain evidence.
-- Run with the migration runner's transaction; a failed guard rolls back every change.
CREATE TABLE _address_contract_docs(id INTEGER PRIMARY KEY,tableName TEXT,columnName TEXT,rowId INTEGER,body TEXT);
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationRevision','facts',rowid,facts FROM locationRevision WHERE facts IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'feature','addressMeta',rowid,addressMeta FROM feature WHERE addressMeta IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'featureLocation','acceptedOverrides',rowid,acceptedOverrides FROM featureLocation WHERE acceptedOverrides IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'featureLocationHistory','acceptedOverrides',rowid,acceptedOverrides FROM featureLocationHistory WHERE acceptedOverrides IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'organisationLocation','overrides',rowid,overrides FROM organisationLocation WHERE overrides IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'organisationLocation','history',rowid,history FROM organisationLocation WHERE history IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationAdoptionProposal','evidence',rowid,evidence FROM locationAdoptionProposal WHERE evidence IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','baseline',rowid,baseline FROM locationIdentityReview WHERE baseline IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','projection',rowid,projection FROM locationIdentityReview WHERE projection IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','mergeReviews',rowid,mergeReviews FROM locationIdentityReview WHERE mergeReviews IS NOT NULL;
INSERT INTO _address_contract_docs(tableName,columnName,rowId,body) SELECT 'locationRefreshItem','projection',rowid,projection FROM locationRefreshItem WHERE projection IS NOT NULL;

-- Fail before rewriting ambiguous classifications or multiple saved locality paths.
CREATE TABLE _address_contract_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _address_contract_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM locationRevision WHERE
 (json_array_length(facts,'$.details.brands')>0 OR json_extract(facts,'$.details.operatingStatus') IS NOT NULL)
 AND json_extract(facts,'$.details.buildingStatus') IS NOT NULL
) THEN 1 ELSE 0 END;
INSERT INTO _address_contract_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _address_contract_docs d,json_tree(d.body) j
 WHERE j.key='divisionOverrides' AND j.type='object'
 AND json_array_length(j.value,'$.localityPaths')>1
 AND j.fullkey NOT LIKE '%.payload.%' AND j.fullkey NOT LIKE '%.rawSource.%'
 AND j.fullkey NOT LIKE '%.records.%' AND j.fullkey NOT LIKE '%.legacy.%'
) THEN 1 ELSE 0 END;
-- Do not overwrite conflicting renamed values or guess how mixed per-class marker choices collapse.
INSERT INTO _address_contract_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _address_contract_docs d,json_tree(d.body) j
 WHERE j.type='object' AND j.fullkey NOT LIKE '%.payload.%'
 AND j.fullkey NOT LIKE '%.rawSource.%' AND j.fullkey NOT LIKE '%.records.%' AND j.fullkey NOT LIKE '%.legacy.%'
 AND ((json_type(j.value,'$.addressSnapshotId') IS NOT NULL AND json_type(j.value,'$.snapshotId') IS NOT NULL AND json_extract(j.value,'$.addressSnapshotId') IS NOT json_extract(j.value,'$.snapshotId'))
 OR (json_type(j.value,'$.records') IS NOT NULL AND json_type(j.value,'$.rawSource') IS NOT NULL AND json_extract(j.value,'$.records') IS NOT json_extract(j.value,'$.rawSource'))
 OR (j.key='divisionOverrides' AND json_type(j.value,'$.localityPaths') IS NOT 'array' AND json_type(j.value,'$.localityPath') IS NULL
 AND EXISTS(SELECT 1 FROM json_each(j.value) v WHERE v.type='text')
 AND EXISTS(SELECT 1 FROM json_each(j.value) v WHERE v.type='object')))
) THEN 1 ELSE 0 END;
CREATE TABLE _address_contract_edits(docId INTEGER,n INTEGER,path TEXT,value TEXT,oldPath TEXT,PRIMARY KEY(docId,n));
-- Change only recognised Address envelopes; upstream Places addressSnapshotId stays untouched.
INSERT INTO _address_contract_edits
SELECT d.id,row_number() OVER(PARTITION BY d.id ORDER BY j.id,k.key),
 j.fullkey||CASE k.key WHEN 'addressSnapshotId' THEN '.snapshotId' ELSE '.rawSource' END,
 CASE WHEN k.type IN ('object','array') THEN k.value ELSE json_quote(k.value) END,j.fullkey||'.'||k.key
FROM _address_contract_docs d,json_tree(d.body) j,json_each(CASE WHEN j.type='object' THEN j.value ELSE '{}' END) k
WHERE j.type='object' AND json_extract(j.value,'$.status') IN ('resolved','unresolved')
 AND json_type(j.value,'$.address2dId') IS NOT NULL
 AND k.key IN ('addressSnapshotId','records')
 AND j.fullkey NOT LIKE '%.payload.%' AND j.fullkey NOT LIKE '%.rawSource.%'
 AND j.fullkey NOT LIKE '%.records.%' AND j.fullkey NOT LIKE '%.legacy.%';
WITH RECURSIVE rewritten(id,n,body) AS (
 SELECT id,0,body FROM _address_contract_docs
 UNION ALL
 SELECT r.id,e.n,json_remove(json_set(r.body,e.path,json(e.value)),e.oldPath)
 FROM rewritten r JOIN _address_contract_edits e ON e.docId=r.id AND e.n=r.n+1
)
UPDATE _address_contract_docs SET body=(SELECT body FROM rewritten WHERE id=_address_contract_docs.id ORDER BY n DESC LIMIT 1);
DELETE FROM _address_contract_edits;
-- A single source path is the complete override, with no duplicate per-class IDs.
INSERT INTO _address_contract_edits
SELECT d.id,row_number() OVER(PARTITION BY d.id ORDER BY j.id),j.fullkey,
 CASE
 WHEN json_type(j.value,'$.localityPath') IS NOT NULL THEN j.value
 WHEN json_type(j.value,'$.localityPaths')='array' THEN json_object('localityPath',json(COALESCE(json_extract(j.value,'$.localityPaths[0]'),'[]')))
 WHEN EXISTS(SELECT 1 FROM json_each(j.value) v WHERE v.type='object' AND json_extract(CASE WHEN v.type='object' THEN v.value ELSE '{}' END,'$.mode')='marker') THEN json_object('localityPath',NULL)
 WHEN EXISTS(SELECT 1 FROM json_each(j.value) v WHERE v.key IN ('townId','ruralAreaId','macrohoodId','neighbourhoodId','villageId','microhoodId','hamletId')) THEN
 json_object('localityPath',json((SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(j.value) WHERE type='text' AND key IN ('townId','ruralAreaId','macrohoodId','neighbourhoodId','villageId','microhoodId','hamletId')
 ORDER BY CASE key WHEN 'townId' THEN 1 WHEN 'ruralAreaId' THEN 2 WHEN 'macrohoodId' THEN 2 WHEN 'neighbourhoodId' THEN 3 WHEN 'villageId' THEN 3 ELSE 4 END))))
 ELSE '{}' END,NULL
FROM _address_contract_docs d,json_tree(d.body) j
WHERE j.key='divisionOverrides' AND j.type='object'
 AND j.fullkey NOT LIKE '%.payload.%' AND j.fullkey NOT LIKE '%.rawSource.%'
 AND j.fullkey NOT LIKE '%.legacy.%';
WITH RECURSIVE rewritten(id,n,body) AS (
 SELECT id,0,body FROM _address_contract_docs
 UNION ALL
 SELECT r.id,e.n,json_set(r.body,e.path,json(e.value))
 FROM rewritten r JOIN _address_contract_edits e ON e.docId=r.id AND e.n=r.n+1
)
UPDATE _address_contract_docs SET body=(SELECT body FROM rewritten WHERE id=_address_contract_docs.id ORDER BY n DESC LIMIT 1);
-- Concrete facts determine previously unknown kinds. Empty/null legacy fields assert nothing.
UPDATE _address_contract_docs SET body=json_set(body,'$.kind',CASE
 WHEN json_array_length(body,'$.details.brands')>0 OR json_extract(body,'$.details.operatingStatus') IS NOT NULL THEN 'establishment'
 WHEN json_extract(body,'$.details.buildingStatus') IS NOT NULL THEN 'building'
 ELSE 'unknown' END)
WHERE tableName='locationRevision' AND json_extract(body,'$.kind')='unknown';
UPDATE _address_contract_docs SET body=json_set(body,'$.details',json('{}'))
WHERE tableName='locationRevision' AND json_extract(body,'$.kind')='unknown';
UPDATE _address_contract_docs SET body=json_remove(body,'$.details.buildingStatus')
WHERE tableName='locationRevision' AND json_extract(body,'$.kind')='establishment' AND json_extract(body,'$.details.buildingStatus') IS NULL;
UPDATE _address_contract_docs SET body=json_remove(body,'$.details.brands','$.details.operatingStatus')
WHERE tableName='locationRevision' AND json_extract(body,'$.kind')='building';
DROP TRIGGER location_revision_no_update;
DROP TRIGGER feature_location_revision_update;
DROP TRIGGER feature_location_history_update;
DROP TRIGGER feature_location_history_no_update;
DROP TRIGGER organisation_location_history;
DROP TRIGGER organisation_location_change_update;
DROP TRIGGER location_adoption_proposal_no_update;
DROP TRIGGER location_identity_review_no_update;
UPDATE locationRevision SET facts=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationRevision' AND d.columnName='facts' AND d.rowId=locationRevision.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationRevision' AND columnName='facts');
UPDATE feature SET addressMeta=(SELECT body FROM _address_contract_docs d WHERE d.tableName='feature' AND d.columnName='addressMeta' AND d.rowId=feature.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='feature' AND columnName='addressMeta');
UPDATE featureLocation SET acceptedOverrides=(SELECT body FROM _address_contract_docs d WHERE d.tableName='featureLocation' AND d.columnName='acceptedOverrides' AND d.rowId=featureLocation.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='featureLocation' AND columnName='acceptedOverrides');
UPDATE featureLocationHistory SET acceptedOverrides=(SELECT body FROM _address_contract_docs d WHERE d.tableName='featureLocationHistory' AND d.columnName='acceptedOverrides' AND d.rowId=featureLocationHistory.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='featureLocationHistory' AND columnName='acceptedOverrides');
UPDATE organisationLocation SET overrides=(SELECT body FROM _address_contract_docs d WHERE d.tableName='organisationLocation' AND d.columnName='overrides' AND d.rowId=organisationLocation.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='organisationLocation' AND columnName='overrides');
UPDATE organisationLocation SET history=(SELECT body FROM _address_contract_docs d WHERE d.tableName='organisationLocation' AND d.columnName='history' AND d.rowId=organisationLocation.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='organisationLocation' AND columnName='history');
UPDATE locationAdoptionProposal SET evidence=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationAdoptionProposal' AND d.columnName='evidence' AND d.rowId=locationAdoptionProposal.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationAdoptionProposal' AND columnName='evidence');
UPDATE locationIdentityReview SET baseline=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='baseline' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationIdentityReview' AND columnName='baseline');
UPDATE locationIdentityReview SET projection=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='projection' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationIdentityReview' AND columnName='projection');
UPDATE locationIdentityReview SET mergeReviews=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='mergeReviews' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationIdentityReview' AND columnName='mergeReviews');
UPDATE locationRefreshItem SET projection=(SELECT body FROM _address_contract_docs d WHERE d.tableName='locationRefreshItem' AND d.columnName='projection' AND d.rowId=locationRefreshItem.rowid) WHERE rowid IN (SELECT rowId FROM _address_contract_docs WHERE tableName='locationRefreshItem' AND columnName='projection');
UPDATE location SET kind=(SELECT json_extract(r.facts,'$.kind') FROM locationRevision r WHERE r.locationId=location.id ORDER BY r.sequence DESC LIMIT 1)
WHERE kind='unknown' AND (SELECT json_extract(r.facts,'$.kind') FROM locationRevision r WHERE r.locationId=location.id ORDER BY r.sequence DESC LIMIT 1) IN ('establishment','building');

CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;

CREATE TRIGGER feature_location_revision_update BEFORE UPDATE ON featureLocation
WHEN NEW.featureId != OLD.featureId OR NEW.revision = OLD.revision OR length(NEW.revision) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location update requires a new revision'); END;

CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation
BEGIN
  INSERT INTO featureLocationHistory(featureId,revision,previousRevision,action,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision)
  VALUES (NEW.featureId,NEW.revision,OLD.revision,'update',NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision);
END;

CREATE TRIGGER feature_location_history_no_update BEFORE UPDATE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;

CREATE TRIGGER organisation_location_history BEFORE UPDATE ON organisationLocation
 WHEN NEW.organisationId IS NOT OLD.organisationId OR NEW.locationId IS NOT OLD.locationId OR NEW.createdAt IS NOT OLD.createdAt
 OR json_array_length(NEW.history)!=json_array_length(OLD.history)+1
 OR EXISTS(SELECT 1 FROM json_each(OLD.history) p WHERE json_extract(NEW.history,'$['||p.key||']') IS NOT p.value)
 OR json_extract(NEW.history,'$[#-1].revision') IS NOT NEW.revision
 OR json_extract(NEW.history,'$[#-1].overrides') IS NOT json(NEW.overrides)
 BEGIN SELECT RAISE(ABORT,'Organisation Location correction history is append-only'); END;

CREATE TRIGGER organisation_location_change_update AFTER UPDATE ON organisationLocation
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,status,origin,organisationId,organisationRevision,actorId)
 VALUES('local:'||NEW.revision,NEW.locationId,NULL,'pending','local',NEW.organisationId,NEW.revision,NEW.actorId); END;

CREATE TRIGGER location_adoption_proposal_no_update BEFORE UPDATE ON locationAdoptionProposal
WHEN NEW.organisationRevision IS NOT OLD.organisationRevision OR NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.locationId IS NOT OLD.locationId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Location adoption evidence and decisions are immutable'); END;

CREATE TRIGGER location_identity_review_no_update BEFORE UPDATE ON locationIdentityReview
WHEN NEW.id IS NOT OLD.id OR NEW.locationId IS NOT OLD.locationId OR NEW.ownerOrganisationId IS NOT OLD.ownerOrganisationId
  OR NEW.baseline IS NOT OLD.baseline OR NEW.projection IS NOT OLD.projection
  OR NEW.actorId IS NOT OLD.actorId OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.rejection IS NOT NULL AND NEW.rejection IS NOT OLD.rejection)
  OR json_array_length(NEW.mergeReviews)<json_array_length(OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(OLD.mergeReviews) old
    WHERE json_extract(NEW.mergeReviews,'$['||old.key||']') IS NOT old.value)
BEGIN SELECT RAISE(ABORT,'Location identity evidence and decisions are immutable'); END;

CREATE TRIGGER location_revision_unknown_details BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.kind')='unknown' AND EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.details'))
BEGIN SELECT RAISE(ABORT,'Unknown Location facts cannot contain kind-specific details'); END;
DROP TABLE _address_contract_edits;
DROP TABLE _address_contract_docs;
DROP TABLE _address_contract_guard;
