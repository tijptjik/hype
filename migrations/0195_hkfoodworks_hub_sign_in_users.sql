-- Refs #189. Enable HKFoodWorks organisation users and hub sign-in enrolment.
-- Preserve other enrolment rules and existing grants; this affects future sign-ins.
-- Reserve every changed organisation so an active writer fails rather than being reused.
INSERT INTO organisationRevisionWrite(organisationId,token,revisionId,baselineRevisionId)
SELECT o.id,'migration:0195:hkfoodworks-hub-sign-in',lower(hex(randomblob(16))),lower(hex(randomblob(16)))
FROM organisation o
LEFT JOIN organisationUserPolicy policy ON policy.organisationId=o.id
WHERE o.code='hkfoodworks'
  AND (COALESCE(policy.enabled,0)=0 OR COALESCE(policy.hubSignIn,0)=0);

-- Only organisations already enrolled in history receive an attributed revision.
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT 'migration:0195:hkfoodworks-hub-sign-in','system:migration:0195','migration',
  'Enable HKFoodWorks hub sign-in organisation users',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(
  SELECT 1 FROM organisationRevisionWrite w
  JOIN organisationRevisionHead h ON h.organisationId=w.organisationId
  WHERE w.token='migration:0195:hkfoodworks-hub-sign-in'
);

INSERT INTO organisationUserPolicy(organisationId,enabled,hubSignIn,revision)
SELECT organisationId,1,1,1 FROM organisationRevisionWrite
WHERE token='migration:0195:hkfoodworks-hub-sign-in'
ON CONFLICT(organisationId) DO UPDATE
SET enabled=1,hubSignIn=1,revision=organisationUserPolicy.revision+1;

-- Match the application snapshot, including omission of default-off contributions.
INSERT INTO organisationRevision(id,organisationId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,w.organisationId,h.currentRevisionId,'migration:0195:hkfoodworks-hub-sign-in',
  json_set(r.content,'$.userPolicy',json_patch(json_object(
    'enabled',json('true'),
    'hubSignIn',json('true'),
    'emailDomain',policy.emailDomain,
    'customCard',json(CASE WHEN policy.customCard THEN 'true' ELSE 'false' END)),
    CASE WHEN policy.contribution=1 THEN '{"contribution":true}' ELSE '{}' END)),r.schemaVersion
FROM organisationRevisionWrite w
JOIN organisationRevisionHead h ON h.organisationId=w.organisationId
JOIN organisationRevision r ON r.id=h.currentRevisionId
JOIN organisationUserPolicy policy ON policy.organisationId=w.organisationId
WHERE w.token='migration:0195:hkfoodworks-hub-sign-in';

-- Invalidate open organisation forms as well as the independent policy revision.
UPDATE organisation SET modifiedAt=CASE
  WHEN modifiedAt>=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds')
  ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
WHERE id IN(SELECT organisationId FROM organisationRevisionWrite WHERE token='migration:0195:hkfoodworks-hub-sign-in');

UPDATE organisationRevisionHead SET currentRevisionId=(
  SELECT w.revisionId FROM organisationRevisionWrite w
  WHERE w.organisationId=organisationRevisionHead.organisationId AND w.token='migration:0195:hkfoodworks-hub-sign-in'
),generation=generation+1
WHERE organisationId IN(SELECT organisationId FROM organisationRevisionWrite WHERE token='migration:0195:hkfoodworks-hub-sign-in');

DELETE FROM organisationRevisionWrite WHERE token='migration:0195:hkfoodworks-hub-sign-in';
