-- Five-minute sliding windows for newly recorded user edits. Existing history stays sealed.
-- Attribution and edit-concurrency tokens remain independent of mutable snapshot identity.
CREATE TABLE revisionEditWindow (
  resource TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  actorId TEXT NOT NULL,
  origin TEXT NOT NULL,
  lastEditedAt INTEGER NOT NULL,
  closedAt INTEGER,
  PRIMARY KEY(resource,revisionId)
);

DROP TRIGGER organisation_revision_immutable_update;
CREATE TRIGGER organisation_revision_immutable_update BEFORE UPDATE ON organisationRevision
WHEN NEW.id IS NOT OLD.id OR NEW.organisationId IS NOT OLD.organisationId
  OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
  OR NEW.schemaVersion IS NOT OLD.schemaVersion OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN organisationRevisionHead h ON h.currentRevisionId=e.revisionId JOIN organisationRevisionWrite w ON w.organisationId=h.organisationId AND w.revisionId=e.revisionId JOIN revisionChangeSet c ON c.id=OLD.changeSetId WHERE e.resource='organisation' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user' AND c.origin='user' AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'organisation revision is immutable'); END;

DROP TRIGGER organisation_revision_logo_no_delete;
CREATE TRIGGER organisation_revision_logo_no_delete BEFORE DELETE ON organisationRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN organisationRevisionHead h ON h.currentRevisionId=e.revisionId JOIN organisationRevisionWrite w ON w.organisationId=h.organisationId AND w.revisionId=e.revisionId WHERE e.resource='organisation' AND e.revisionId=OLD.revisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER organisation_revision_logo_refresh AFTER UPDATE OF content ON organisationRevision
BEGIN
  DELETE FROM organisationRevisionLogo WHERE revisionId=NEW.id;
  SELECT CASE WHEN json_type(NEW.content,'$.logo') IS NOT NULL
    AND json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO organisationRevisionLogo(revisionId,imageId,imageRevisionId)
  SELECT NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId')
  WHERE json_type(NEW.content,'$.logo') IS NOT NULL;
END;

DROP TRIGGER project_revision_immutable_update;
CREATE TRIGGER project_revision_immutable_update BEFORE UPDATE ON projectRevision
WHEN NEW.id IS NOT OLD.id OR NEW.projectId IS NOT OLD.projectId
  OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
  OR NEW.schemaVersion IS NOT OLD.schemaVersion OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN projectRevisionHead h ON h.currentRevisionId=e.revisionId JOIN projectRevisionWrite w ON w.projectId=h.projectId AND w.revisionId=e.revisionId JOIN revisionChangeSet c ON c.id=OLD.changeSetId WHERE e.resource='project' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user' AND c.origin='user' AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'project revision is immutable'); END;

DROP TRIGGER project_revision_logo_no_delete;
CREATE TRIGGER project_revision_logo_no_delete BEFORE DELETE ON projectRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN projectRevisionHead h ON h.currentRevisionId=e.revisionId JOIN projectRevisionWrite w ON w.projectId=h.projectId AND w.revisionId=e.revisionId WHERE e.resource='project' AND e.revisionId=OLD.revisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER project_revision_logo_refresh AFTER UPDATE OF content ON projectRevision
BEGIN
  DELETE FROM projectRevisionLogo WHERE revisionId=NEW.id;
  SELECT CASE WHEN json_type(NEW.content,'$.logo') IS NOT NULL
    AND json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO projectRevisionLogo(revisionId,imageId,imageRevisionId)
  SELECT NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId')
  WHERE json_type(NEW.content,'$.logo') IS NOT NULL;
END;

DROP TRIGGER layer_revision_immutable_update;
CREATE TRIGGER layer_revision_immutable_update BEFORE UPDATE ON layerRevision
WHEN NEW.id IS NOT OLD.id OR NEW.layerId IS NOT OLD.layerId
  OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
  OR NEW.schemaVersion IS NOT OLD.schemaVersion OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN layerRevisionHead h ON h.currentRevisionId=e.revisionId JOIN layerRevisionWrite w ON w.layerId=h.layerId AND w.revisionId=e.revisionId JOIN revisionChangeSet c ON c.id=OLD.changeSetId WHERE e.resource='layer' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user' AND c.origin='user' AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'layer revision is immutable'); END;

DROP TRIGGER hub_revision_immutable_update;
CREATE TRIGGER hub_revision_immutable_update BEFORE UPDATE ON hubRevision
WHEN NEW.id IS NOT OLD.id OR NEW.hubId IS NOT OLD.hubId
  OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
  OR NEW.schemaVersion IS NOT OLD.schemaVersion OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN hubRevisionHead h ON h.currentRevisionId=e.revisionId JOIN hubRevisionWrite w ON w.hubId=h.hubId AND w.revisionId=e.revisionId JOIN revisionChangeSet c ON c.id=OLD.changeSetId WHERE e.resource='hub' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user' AND c.origin='user' AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'hub revision is immutable'); END;

DROP TRIGGER hub_revision_logo_no_delete;
CREATE TRIGGER hub_revision_logo_no_delete BEFORE DELETE ON hubRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN hubRevisionHead h ON h.currentRevisionId=e.revisionId JOIN hubRevisionWrite w ON w.hubId=h.hubId AND w.revisionId=e.revisionId WHERE e.resource='hub' AND e.revisionId=OLD.revisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER hub_revision_logo_refresh AFTER UPDATE OF content ON hubRevision
BEGIN
  DELETE FROM hubRevisionLogo WHERE revisionId=NEW.id;
  SELECT CASE WHEN json_type(NEW.content,'$.logo') IS NOT NULL
    AND json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO hubRevisionLogo(revisionId,imageId,imageRevisionId)
  SELECT NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId')
  WHERE json_type(NEW.content,'$.logo') IS NOT NULL;
END;

CREATE TABLE revisionEditSelection(token TEXT PRIMARY KEY,revisionId TEXT NOT NULL);
DROP TRIGGER property_catalog_revision_update;
CREATE TRIGGER property_catalog_revision_update BEFORE UPDATE ON propertyCatalogRevision
WHEN NEW.id IS NOT OLD.id OR NEW.scope IS NOT OLD.scope OR NEW.resourceId IS NOT OLD.resourceId
  OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.changeSetId IS NOT OLD.changeSetId
  OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e
    JOIN propertyCatalogRevisionHead h ON h.currentRevisionId=e.revisionId
    JOIN propertyCatalogRevisionWrite w ON w.scope=h.scope AND w.resourceId=h.resourceId
    JOIN revisionEditSelection selection ON selection.token=w.token AND selection.revisionId=e.revisionId
    JOIN revisionChangeSet c ON c.id=OLD.changeSetId
    WHERE e.resource='propertyCatalog' AND e.revisionId=OLD.id AND e.actorId=c.actorId AND e.origin='user' AND c.origin='user'
      AND e.closedAt IS NULL AND e.lastEditedAt <= (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
      AND e.closedAt IS NULL AND e.lastEditedAt > (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'property catalog revision is immutable'); END;

-- Feature snapshots remain mutable only while unpinned by proposal/review/identity evidence.
DROP TRIGGER featureRevision_immutable_update;
CREATE TRIGGER featureRevision_immutable_update BEFORE UPDATE ON featureRevision
WHEN NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId
 OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.mergedFromRevisionId IS NOT OLD.mergedFromRevisionId
 OR NEW.changeSetId IS NOT OLD.changeSetId OR NEW.schemaVersion IS NOT OLD.schemaVersion
 OR NOT (EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId JOIN featureRevisionWriteScope w ON w.featureId=OLD.featureId WHERE e.resource='feature' AND e.revisionId=OLD.id AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)) OR (EXISTS(SELECT 1 FROM featureRevision r WHERE r.previousRevisionId=OLD.id OR r.mergedFromRevisionId=OLD.id)
 OR EXISTS(SELECT 1 FROM featureRevisionProposal p WHERE p.baseRevisionId=OLD.id OR (p.candidateRevisionId=OLD.id AND p.status!='draft'))
 OR EXISTS(SELECT 1 FROM featureRevisionReview r WHERE (r.candidateRevisionId=OLD.id OR r.comparedRevisionId=OLD.id OR r.resultingRevisionId=OLD.id) AND r.action NOT IN ('created','saved'))
 OR EXISTS(SELECT 1 FROM featureIdentityOperationMember m WHERE m.revisionId=OLD.id))
BEGIN SELECT RAISE(ABORT,'featureRevision is immutable'); END;

DROP TRIGGER featureRevisionPublication_immutable_update;
CREATE TRIGGER featureRevisionPublication_immutable_update BEFORE UPDATE ON featureRevisionPublication
WHEN NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId
 OR NEW.previousRevisionId IS NOT OLD.previousRevisionId OR NEW.revisionId IS NOT OLD.revisionId
 OR NEW.changeSetId IS NOT OLD.changeSetId OR NEW.generation!=OLD.generation+1
 OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
   JOIN featureRevisionWriteScope w ON w.featureId=OLD.featureId
   JOIN featureRevisionHead h ON h.featureId=OLD.featureId AND h.publishedRevisionId=OLD.revisionId AND h.generation=NEW.generation
   WHERE e.resource='feature' AND e.revisionId=OLD.revisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'featureRevisionPublication is immutable'); END;

CREATE TRIGGER feature_idle_proposal_base AFTER INSERT ON featureRevisionProposal
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId=NEW.baseRevisionId; END;
CREATE TRIGGER feature_idle_review_boundary AFTER INSERT ON featureRevisionReview
WHEN NEW.action NOT IN ('created','saved')
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId IN (NEW.candidateRevisionId,NEW.comparedRevisionId,NEW.resultingRevisionId); END;
CREATE TRIGGER feature_idle_submission_boundary AFTER UPDATE OF status ON featureRevisionProposal
WHEN NEW.status!='draft'
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId=NEW.candidateRevisionId; END;
CREATE TRIGGER feature_idle_visibility_boundary AFTER UPDATE OF isPublished,isArchived ON feature
WHEN NEW.isPublished IS NOT OLD.isPublished OR NEW.isArchived IS NOT OLD.isArchived
BEGIN UPDATE revisionEditWindow SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE resource='feature' AND revisionId IN (SELECT id FROM featureRevision WHERE featureId=NEW.id); END;

CREATE TRIGGER feature_revision_gallery_update BEFORE UPDATE OF content ON featureRevision
WHEN json_type(NEW.content,'$.gallery') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_type(NEW.content,'$.gallery') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.entries') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.order') IS NOT 'array'
    OR json_array_length(NEW.content,'$.gallery.order') != (SELECT count(*) FROM json_each(NEW.content,'$.gallery.entries'))
    OR EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.order') o
      WHERE o.type!='text' OR NOT EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.entries') e WHERE e.key=o.value))
  THEN RAISE(ABORT,'invalid revision gallery') END;
END;

DROP TRIGGER featureRevisionImage_immutable_delete;
CREATE TRIGGER featureRevisionImage_immutable_delete BEFORE DELETE ON featureRevisionImage
WHEN NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
 JOIN featureRevision r ON r.id=e.revisionId JOIN featureRevisionWriteScope w ON w.featureId=r.featureId
 WHERE e.resource='feature' AND e.revisionId=OLD.featureRevisionId AND e.closedAt IS NULL AND e.lastEditedAt<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND e.lastEditedAt>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'featureRevisionImage is immutable'); END;
CREATE TRIGGER feature_revision_gallery_refresh AFTER UPDATE OF content ON featureRevision
BEGIN
 DELETE FROM featureRevisionImage WHERE featureRevisionId=NEW.id;
 INSERT INTO featureRevisionImage(featureRevisionId,imageId,imageRevisionId,position,intent)
 SELECT NEW.id,e.key,json_extract(e.value,'$.imageRevisionId'),CAST(o.key AS INTEGER),json_extract(e.value,'$.intent')
 FROM json_each(NEW.content,'$.gallery.entries') e JOIN json_each(NEW.content,'$.gallery.order') o ON o.value=e.key;
END;

-- Private editing keeps the same snapshot while advancing its independently checked head token.
DROP TRIGGER feature_private_capture_no_update;
CREATE TRIGGER feature_private_capture_no_update BEFORE UPDATE ON featurePrivateCapture
WHEN NEW.sequence IS NOT OLD.sequence OR NEW.featureId IS NOT OLD.featureId OR NEW.revisionId IS NOT OLD.revisionId
 OR NEW.generation!=OLD.generation+1 OR NOT EXISTS(
 SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
 JOIN featureRevisionWriteScope w ON w.featureId=OLD.featureId
 JOIN featureRevisionHead h ON h.featureId=OLD.featureId AND h.publishedRevisionId IS NULL AND h.generation=NEW.generation
 WHERE e.resource='feature' AND e.revisionId=OLD.revisionId
 AND e.closedAt IS NULL AND e.lastEditedAt <= (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 AND e.closedAt IS NULL AND e.lastEditedAt > (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Private captures are immutable'); END;

DROP TRIGGER image_intent_history_no_update;
CREATE TRIGGER image_intent_history_no_update BEFORE UPDATE ON imageIntentPolicyRevision
WHEN NEW.id IS NOT OLD.id OR NEW.scopeType IS NOT OLD.scopeType OR NEW.scopeId IS NOT OLD.scopeId
 OR NEW.actorId IS NOT OLD.actorId OR NEW.createdAt IS NOT OLD.createdAt OR NEW.previous IS NOT OLD.previous
 OR NOT EXISTS(SELECT 1 FROM revisionEditWindow e JOIN revisionEditSelection x ON x.revisionId=e.revisionId
 WHERE e.resource='imageIntentPolicy' AND e.revisionId=OLD.id AND e.actorId=OLD.actorId
 AND e.closedAt IS NULL AND e.lastEditedAt <= (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 AND e.closedAt IS NULL AND e.lastEditedAt > (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-300000)
BEGIN SELECT RAISE(ABORT,'Image intent history is immutable'); END;

CREATE TRIGGER feature_idle_upload_boundary AFTER INSERT ON featureImageUploadRevision
BEGIN UPDATE revisionEditWindow
 SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 WHERE resource='feature' AND revisionId=NEW.candidateRevisionId; END;
CREATE TRIGGER feature_idle_identity_proposal_boundary AFTER INSERT ON featureIdentityProposal
BEGIN UPDATE revisionEditWindow
 SET closedAt=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 WHERE resource='feature' AND revisionId IN (SELECT value FROM json_tree(NEW.plan) WHERE key='revisionId'); END;
