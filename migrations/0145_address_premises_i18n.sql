-- Refs #194. Adopt @saanseoi/address 0.2.1 authored content.
-- Repeat premisesType in each locale and convert the pre-release granularity vocabulary.
-- Raw source responses and provenance retain their original publication contract.
CREATE TABLE _premises_docs(id INTEGER PRIMARY KEY,tableName TEXT,columnName TEXT,rowId INTEGER,body TEXT);
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationRevision','facts',rowid,facts FROM locationRevision WHERE facts IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'feature','addressMeta',rowid,addressMeta FROM feature WHERE addressMeta IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'featureLocation','acceptedOverrides',rowid,acceptedOverrides FROM featureLocation WHERE acceptedOverrides IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'featureLocationHistory','acceptedOverrides',rowid,acceptedOverrides FROM featureLocationHistory WHERE acceptedOverrides IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'organisationLocation','overrides',rowid,overrides FROM organisationLocation WHERE overrides IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'organisationLocation','history',rowid,history FROM organisationLocation WHERE history IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationAdoptionProposal','evidence',rowid,evidence FROM locationAdoptionProposal WHERE evidence IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','baseline',rowid,baseline FROM locationIdentityReview WHERE baseline IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','projection',rowid,projection FROM locationIdentityReview WHERE projection IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationIdentityReview','mergeReviews',rowid,mergeReviews FROM locationIdentityReview WHERE mergeReviews IS NOT NULL;
INSERT INTO _premises_docs(tableName,columnName,rowId,body) SELECT 'locationRefreshItem','projection',rowid,projection FROM locationRefreshItem WHERE projection IS NOT NULL;
CREATE TABLE _premises_content(docId INTEGER,n INTEGER,path TEXT,body TEXT,PRIMARY KEY(docId,n));
INSERT INTO _premises_content
SELECT d.id,row_number() OVER(PARTITION BY d.id ORDER BY j.id),j.fullkey,j.value
FROM _premises_docs d,json_tree(d.body) j
WHERE j.key='authored' AND j.type='object'
 AND j.fullkey NOT LIKE '%.payload.%' AND j.fullkey NOT LIKE '%.rawSource.%' AND j.fullkey NOT LIKE '%.legacy.%';
-- Reject conflicting classification values before any application table is changed.
CREATE TABLE _premises_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _premises_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _premises_content c WHERE
 (json_type(c.body,'$.granularity') IS NOT NULL AND json_type(c.body,'$.scope') IS NOT NULL AND json_extract(c.body,'$.granularity') IS NOT json_extract(c.body,'$.scope'))
 OR COALESCE(json_extract(c.body,'$.scope'),json_extract(c.body,'$.granularity')) NOT IN ('unknown','premises','phase','building','section','floor','unit','unit_portion','site','complex')
 OR (json_extract(c.body,'$.premisesType') IS NOT NULL AND json_extract(c.body,'$.premisesType') NOT IN ('site','complex'))
 OR EXISTS(SELECT 1 FROM json_each(c.body,'$.i18n') l WHERE json_extract(l.value,'$.premisesType') IS NOT NULL
   AND (json_extract(l.value,'$.premisesType') NOT IN ('site','complex') OR
    (json_extract(c.body,'$.premisesType') IS NOT NULL AND json_extract(c.body,'$.premisesType') IS NOT json_extract(l.value,'$.premisesType'))))
 OR (SELECT count(DISTINCT json_extract(l.value,'$.premisesType')) FROM json_each(c.body,'$.i18n') l)>1
 OR (COALESCE(json_extract(c.body,'$.premisesType'),CASE WHEN json_extract(c.body,'$.granularity') IN ('site','complex') THEN json_extract(c.body,'$.granularity') END) IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM json_each(c.body,'$.i18n')))
) THEN 1 ELSE 0 END;
-- Each retained locale receives the known canonical value; no new locale or classification is invented.
UPDATE _premises_content SET body=json_remove(json_set(body,
 '$.scope',CASE COALESCE(json_extract(body,'$.scope'),json_extract(body,'$.granularity')) WHEN 'site' THEN 'premises' WHEN 'complex' THEN 'premises' ELSE COALESCE(json_extract(body,'$.scope'),json_extract(body,'$.granularity')) END,
 '$.i18n',json((SELECT json_group_object(l.key,json(json_set(l.value,'$.premisesType',
 COALESCE(json_extract(_premises_content.body,'$.premisesType'),
 CASE WHEN COALESCE(json_extract(_premises_content.body,'$.scope'),json_extract(_premises_content.body,'$.granularity')) IN ('site','complex') THEN COALESCE(json_extract(_premises_content.body,'$.scope'),json_extract(_premises_content.body,'$.granularity')) END,
 (SELECT json_extract(t.value,'$.premisesType') FROM json_each(_premises_content.body,'$.i18n') t WHERE json_extract(t.value,'$.premisesType') IS NOT NULL LIMIT 1))))) FROM json_each(_premises_content.body,'$.i18n') l))
),'$.granularity','$.premisesType');
WITH RECURSIVE rewritten(id,n,body) AS (
 SELECT id,0,body FROM _premises_docs
 UNION ALL SELECT r.id,c.n,json_set(r.body,c.path,json(c.body))
 FROM rewritten r JOIN _premises_content c ON c.docId=r.id AND c.n=r.n+1
)
UPDATE _premises_docs SET body=(SELECT body FROM rewritten WHERE id=_premises_docs.id ORDER BY n DESC LIMIT 1);
DROP TRIGGER location_revision_no_update;
DROP TRIGGER feature_location_revision_update;
DROP TRIGGER feature_location_history_update;
DROP TRIGGER feature_location_history_no_update;
DROP TRIGGER organisation_location_history;
DROP TRIGGER organisation_location_change_update;
DROP TRIGGER location_adoption_proposal_no_update;
DROP TRIGGER location_identity_review_no_update;
UPDATE locationRevision SET facts=(SELECT body FROM _premises_docs d WHERE d.tableName='locationRevision' AND d.columnName='facts' AND d.rowId=locationRevision.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationRevision' AND columnName='facts');
UPDATE feature SET addressMeta=(SELECT body FROM _premises_docs d WHERE d.tableName='feature' AND d.columnName='addressMeta' AND d.rowId=feature.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='feature' AND columnName='addressMeta');
UPDATE featureLocation SET acceptedOverrides=(SELECT body FROM _premises_docs d WHERE d.tableName='featureLocation' AND d.columnName='acceptedOverrides' AND d.rowId=featureLocation.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='featureLocation' AND columnName='acceptedOverrides');
UPDATE featureLocationHistory SET acceptedOverrides=(SELECT body FROM _premises_docs d WHERE d.tableName='featureLocationHistory' AND d.columnName='acceptedOverrides' AND d.rowId=featureLocationHistory.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='featureLocationHistory' AND columnName='acceptedOverrides');
UPDATE organisationLocation SET overrides=(SELECT body FROM _premises_docs d WHERE d.tableName='organisationLocation' AND d.columnName='overrides' AND d.rowId=organisationLocation.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='organisationLocation' AND columnName='overrides');
UPDATE organisationLocation SET history=(SELECT body FROM _premises_docs d WHERE d.tableName='organisationLocation' AND d.columnName='history' AND d.rowId=organisationLocation.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='organisationLocation' AND columnName='history');
UPDATE locationAdoptionProposal SET evidence=(SELECT body FROM _premises_docs d WHERE d.tableName='locationAdoptionProposal' AND d.columnName='evidence' AND d.rowId=locationAdoptionProposal.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationAdoptionProposal' AND columnName='evidence');
UPDATE locationIdentityReview SET baseline=(SELECT body FROM _premises_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='baseline' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationIdentityReview' AND columnName='baseline');
UPDATE locationIdentityReview SET projection=(SELECT body FROM _premises_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='projection' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationIdentityReview' AND columnName='projection');
UPDATE locationIdentityReview SET mergeReviews=(SELECT body FROM _premises_docs d WHERE d.tableName='locationIdentityReview' AND d.columnName='mergeReviews' AND d.rowId=locationIdentityReview.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationIdentityReview' AND columnName='mergeReviews');
UPDATE locationRefreshItem SET projection=(SELECT body FROM _premises_docs d WHERE d.tableName='locationRefreshItem' AND d.columnName='projection' AND d.rowId=locationRefreshItem.rowid) WHERE rowid IN (SELECT rowId FROM _premises_docs WHERE tableName='locationRefreshItem' AND columnName='projection');

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
DROP TABLE _premises_content;
DROP TABLE _premises_docs;
DROP TABLE _premises_guard;
