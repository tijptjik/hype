-- Data-only migration: use Full / Cast Edges for every currently assigned hub image.
-- Preserve immutable history and bytes. Shared logo owners receive new snapshots too.
-- D1 applies this file transactionally; no remote assets or schema contracts change.
CREATE TABLE _hub_cast_edges_images AS
SELECT DISTINCT i.id, h.imageRevisionId AS previousRevisionId,
  CASE WHEN h.imageRevisionId IS NOT NULL THEN 'migration-0198-image-' || i.id END AS revisionId
FROM hub u JOIN image i ON i.id=u.imageId
LEFT JOIN resourceLogoImageHead h ON h.imageId=i.id
LEFT JOIN imageRevision r ON r.id=h.imageRevisionId
WHERE i.presentationMode IS NOT 'cast-edges'
   OR (h.imageRevisionId IS NOT NULL AND json_extract(r.metadata,'$.presentationMode') IS NOT 'cast-edges');

INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT 'migration-0198-hub-cast-edges','migration:0198','migration',
  'Set existing hub images to Full / Cast Edges',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(SELECT 1 FROM _hub_cast_edges_images WHERE revisionId IS NOT NULL);

-- Open guarded captures for all owners of enrolled images, including shared logos.
INSERT INTO organisationRevisionWrite(organisationId,token,revisionId,baselineRevisionId)
SELECT o.id,'migration-0198','migration-0198-organisation-' || o.id,
  COALESCE(h.currentRevisionId,'migration-0198-organisation-' || o.id)
FROM organisation o JOIN _hub_cast_edges_images i ON i.id=o.imageId
LEFT JOIN organisationRevisionHead h ON h.organisationId=o.id
WHERE i.revisionId IS NOT NULL;

INSERT INTO projectRevisionWrite(projectId,token,revisionId,baselineRevisionId)
SELECT o.id,'migration-0198','migration-0198-project-' || o.id,
  COALESCE(h.currentRevisionId,'migration-0198-project-' || o.id)
FROM project o JOIN _hub_cast_edges_images i ON i.id=o.imageId
LEFT JOIN projectRevisionHead h ON h.projectId=o.id
WHERE i.revisionId IS NOT NULL;

INSERT INTO hubRevisionWrite(hubId,token,revisionId,baselineRevisionId)
SELECT o.id,'migration-0198','migration-0198-hub-' || o.id,
  COALESCE(h.currentRevisionId,'migration-0198-hub-' || o.id)
FROM hub o JOIN _hub_cast_edges_images i ON i.id=o.imageId
LEFT JOIN hubRevisionHead h ON h.hubId=o.id
WHERE i.revisionId IS NOT NULL;

-- Append metadata revisions against the same verified asset; never rewrite old revisions.
INSERT INTO imageRevision(id,imageId,previousRevisionId,assetVersionId,changeSetId,metadata)
SELECT i.revisionId,r.imageId,r.id,r.assetVersionId,'migration-0198-hub-cast-edges',
  json_set(r.metadata,'$.presentationMode','cast-edges')
FROM _hub_cast_edges_images i JOIN imageRevision r ON r.id=i.previousRevisionId;

UPDATE resourceLogoImageHead
SET imageRevisionId=(SELECT revisionId FROM _hub_cast_edges_images i WHERE i.id=imageId)
WHERE imageId IN (SELECT id FROM _hub_cast_edges_images WHERE revisionId IS NOT NULL);

UPDATE image SET presentationMode='cast-edges'
WHERE id IN (SELECT id FROM _hub_cast_edges_images);

-- Only the exact logo pin changes in existing resource snapshots. Legacy owners stay unenrolled.
INSERT INTO organisationRevision(id,organisationId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,o.id,r.id,'migration-0198-hub-cast-edges',
  json_set(r.content,'$.logo',json_object('imageId',o.imageId,'imageRevisionId',i.revisionId)),r.schemaVersion
FROM organisationRevisionWrite w JOIN organisation o ON o.id=w.organisationId
JOIN organisationRevisionHead h ON h.organisationId=o.id
JOIN organisationRevision r ON r.id=h.currentRevisionId
JOIN _hub_cast_edges_images i ON i.id=o.imageId
WHERE w.token='migration-0198';

UPDATE organisationRevisionHead
SET currentRevisionId=(SELECT w.revisionId FROM organisationRevisionWrite w
  WHERE w.organisationId=organisationRevisionHead.organisationId AND w.token='migration-0198'),
  generation=generation+1
WHERE organisationId IN (SELECT organisationId FROM organisationRevisionWrite WHERE token='migration-0198');

DELETE FROM organisationRevisionWrite WHERE token='migration-0198';

INSERT INTO projectRevision(id,projectId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,o.id,r.id,'migration-0198-hub-cast-edges',
  json_set(r.content,'$.logo',json_object('imageId',o.imageId,'imageRevisionId',i.revisionId)),r.schemaVersion
FROM projectRevisionWrite w JOIN project o ON o.id=w.projectId
JOIN projectRevisionHead h ON h.projectId=o.id
JOIN projectRevision r ON r.id=h.currentRevisionId
JOIN _hub_cast_edges_images i ON i.id=o.imageId
WHERE w.token='migration-0198';

UPDATE projectRevisionHead
SET currentRevisionId=(SELECT w.revisionId FROM projectRevisionWrite w
  WHERE w.projectId=projectRevisionHead.projectId AND w.token='migration-0198'),
  generation=generation+1
WHERE projectId IN (SELECT projectId FROM projectRevisionWrite WHERE token='migration-0198');

DELETE FROM projectRevisionWrite WHERE token='migration-0198';

INSERT INTO hubRevision(id,hubId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,o.id,r.id,'migration-0198-hub-cast-edges',
  json_set(r.content,'$.logo',json_object('imageId',o.imageId,'imageRevisionId',i.revisionId)),r.schemaVersion
FROM hubRevisionWrite w JOIN hub o ON o.id=w.hubId
JOIN hubRevisionHead h ON h.hubId=o.id
JOIN hubRevision r ON r.id=h.currentRevisionId
JOIN _hub_cast_edges_images i ON i.id=o.imageId
WHERE w.token='migration-0198';

UPDATE hubRevisionHead
SET currentRevisionId=(SELECT w.revisionId FROM hubRevisionWrite w
  WHERE w.hubId=hubRevisionHead.hubId AND w.token='migration-0198'),
  generation=generation+1
WHERE hubId IN (SELECT hubId FROM hubRevisionWrite WHERE token='migration-0198');

DELETE FROM hubRevisionWrite WHERE token='migration-0198';

DROP TABLE _hub_cast_edges_images;
