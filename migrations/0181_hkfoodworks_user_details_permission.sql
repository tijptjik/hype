-- Refs #189. Explicitly grant HKFoodWorks permission to edit its users' details.
-- Other organisations retain their existing permission. Already-enabled records are
-- unchanged. Preserve immutable history where revision tracking is already enrolled;
-- un-enrolled organisations retain the normal first-application-write baseline.

-- Reserve the existing history chain; an active writer must fail instead of being reused.
INSERT INTO organisationRevisionWrite (organisationId, token, revisionId, baselineRevisionId)
SELECT o.id, 'migration:0181:hkfoodworks-user-details', lower(hex(randomblob(16))), lower(hex(randomblob(16)))
FROM organisation o
JOIN organisationRevisionHead h ON h.organisationId = o.id
WHERE o.code = 'hkfoodworks' AND o.permitUserDetailsEdit = 0;

INSERT INTO revisionChangeSet (id, actorId, origin, reason, createdAt)
SELECT 'migration:0181:hkfoodworks-user-details', 'system:migration:0181', 'migration',
  'Grant HKFoodWorks permission to edit organisation user details',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (
  SELECT 1 FROM organisationRevisionWrite
  WHERE token = 'migration:0181:hkfoodworks-user-details'
);

-- Append the one-field change without modifying earlier revisions or other profile data.
INSERT INTO organisationRevision (id, organisationId, previousRevisionId, changeSetId, content, schemaVersion)
SELECT w.revisionId, w.organisationId, h.currentRevisionId,
  'migration:0181:hkfoodworks-user-details',
  json_set(r.content, '$.record.permitUserDetailsEdit', json('true')), r.schemaVersion
FROM organisationRevisionWrite w
JOIN organisationRevisionHead h ON h.organisationId = w.organisationId
JOIN organisationRevision r ON r.id = h.currentRevisionId
WHERE w.token = 'migration:0181:hkfoodworks-user-details';

UPDATE organisation
SET permitUserDetailsEdit = 1,
  modifiedAt = CASE
    WHEN modifiedAt >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', modifiedAt, '+0.001 seconds')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  END
WHERE code = 'hkfoodworks' AND permitUserDetailsEdit = 0;

UPDATE organisationRevisionHead
SET currentRevisionId = (
    SELECT w.revisionId FROM organisationRevisionWrite w
    WHERE w.organisationId = organisationRevisionHead.organisationId
      AND w.token = 'migration:0181:hkfoodworks-user-details'
  ),
  generation = generation + 1
WHERE organisationId IN (
  SELECT organisationId FROM organisationRevisionWrite
  WHERE token = 'migration:0181:hkfoodworks-user-details'
);

DELETE FROM organisationRevisionWrite
WHERE token = 'migration:0181:hkfoodworks-user-details';
