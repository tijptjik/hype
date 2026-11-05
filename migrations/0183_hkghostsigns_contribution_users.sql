-- Enable contribution enrolment for the HK Ghost Signs project's organisation,
-- resolving the parent through the project rather than relying on an old org code.
-- Preserve existing policy options and append history only where already enrolled.
INSERT INTO organisationRevisionWrite(organisationId,token,revisionId,baselineRevisionId)
SELECT o.id,'migration:0183:ghostsigns-contributors',lower(hex(randomblob(16))),lower(hex(randomblob(16)))
FROM organisation o
JOIN organisationRevisionHead h ON h.organisationId=o.id
LEFT JOIN organisationUserPolicy policy ON policy.organisationId=o.id
WHERE EXISTS(SELECT 1 FROM project p WHERE p.organisationId=o.id AND p.code='hkghostsigns')
  AND (COALESCE(policy.enabled,0)=0 OR COALESCE(policy.contribution,0)=0);

INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT 'migration:0183:ghostsigns-contributors','system:migration:0183','migration',
  'Enable HK Ghost Signs contribution-based organisation users',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(SELECT 1 FROM organisationRevisionWrite WHERE token='migration:0183:ghostsigns-contributors');

INSERT INTO organisationUserPolicy(organisationId,enabled,contribution,revision)
SELECT o.id,1,1,1 FROM organisation o
LEFT JOIN organisationUserPolicy policy ON policy.organisationId=o.id
WHERE EXISTS(SELECT 1 FROM project p WHERE p.organisationId=o.id AND p.code='hkghostsigns')
  AND (COALESCE(policy.enabled,0)=0 OR COALESCE(policy.contribution,0)=0)
ON CONFLICT(organisationId) DO UPDATE SET enabled=1,contribution=1,revision=organisationUserPolicy.revision+1
WHERE organisationUserPolicy.enabled=0 OR organisationUserPolicy.contribution=0;

-- Capture the updated policy in exactly the same JSON shape as the application.
INSERT INTO organisationRevision(id,organisationId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,w.organisationId,h.currentRevisionId,'migration:0183:ghostsigns-contributors',
  json_set(r.content,'$.userPolicy',json_object(
    'enabled',json(CASE WHEN policy.enabled THEN 'true' ELSE 'false' END),
    'hubSignIn',json(CASE WHEN policy.hubSignIn THEN 'true' ELSE 'false' END),
    'emailDomain',policy.emailDomain,
    'customCard',json(CASE WHEN policy.customCard THEN 'true' ELSE 'false' END),
    'contribution',json('true'))),r.schemaVersion
FROM organisationRevisionWrite w
JOIN organisationRevisionHead h ON h.organisationId=w.organisationId
JOIN organisationRevision r ON r.id=h.currentRevisionId
JOIN organisationUserPolicy policy ON policy.organisationId=w.organisationId
WHERE w.token='migration:0183:ghostsigns-contributors';

-- Invalidate stale organisation forms as well as the independent policy revision.
UPDATE organisation SET modifiedAt=CASE
  WHEN modifiedAt>=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds')
  ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
WHERE id IN(SELECT organisationId FROM organisationRevisionWrite WHERE token='migration:0183:ghostsigns-contributors');

UPDATE organisationRevisionHead SET currentRevisionId=(
  SELECT w.revisionId FROM organisationRevisionWrite w
  WHERE w.organisationId=organisationRevisionHead.organisationId AND w.token='migration:0183:ghostsigns-contributors'
),generation=generation+1
WHERE organisationId IN(SELECT organisationId FROM organisationRevisionWrite WHERE token='migration:0183:ghostsigns-contributors');

DELETE FROM organisationRevisionWrite WHERE token='migration:0183:ghostsigns-contributors';

-- Grandfather historical submitters, including imported Features/images without tasks.
-- Rejected/archived contributions still count. Unsubmitted drafts and their uploads do not.
-- UNION deduplicates within each project; the upsert preserves all independent grants.
WITH contributors(projectId,userId) AS (
  SELECT f.projectId,f.contributorId FROM feature f WHERE f.isDraft=0
  UNION
  SELECT f.projectId,i.contributorId FROM featureImage fi
  JOIN feature f ON f.id=fi.featureId JOIN image i ON i.id=fi.imageId
  WHERE f.isDraft=0 AND (
    fi.isPublished=1
    OR NOT EXISTS(SELECT 1 FROM taskImage ti JOIN task t ON t.id=ti.taskId
      WHERE ti.imageId=i.id AND t.featureId=f.id)
    OR EXISTS(SELECT 1 FROM taskImage ti JOIN task t ON t.id=ti.taskId
      WHERE ti.imageId=i.id AND t.featureId=f.id AND t.isDraft=0
        AND t.projectId=f.projectId AND t.organisationId=(SELECT organisationId FROM project WHERE id=f.projectId))
  )
  UNION
  SELECT t.projectId,t.contributorId FROM task t
  JOIN feature f ON f.id=t.featureId JOIN project p ON p.id=f.projectId
  WHERE t.isDraft=0 AND t.type IN('newFeature','newPhoto','reportedMissing')
    AND t.projectId=p.id AND t.organisationId=p.organisationId
  UNION
  SELECT t.projectId,i.contributorId FROM taskImage ti
  JOIN task t ON t.id=ti.taskId JOIN image i ON i.id=ti.imageId
  JOIN feature f ON f.id=t.featureId JOIN project p ON p.id=f.projectId
  WHERE t.isDraft=0 AND t.type IN('newFeature','newPhoto','reportedMissing')
    AND t.projectId=p.id AND t.organisationId=p.organisationId
)
INSERT INTO organisationRole(organisationId,userId,role,grant)
SELECT p.organisationId,u.id,'user',json_object('contribution:'||p.id,'user')
FROM contributors c JOIN project p ON p.id=c.projectId JOIN user u ON u.id=c.userId
WHERE p.code='hkghostsigns' AND u.isAnonymous=0 AND u.isArchived=0
ON CONFLICT(organisationId,userId) DO UPDATE SET grant=json_patch(organisationRole.grant,excluded.grant)
WHERE json_patch(organisationRole.grant,excluded.grant)<>organisationRole.grant;
