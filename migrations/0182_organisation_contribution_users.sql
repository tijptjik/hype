-- Contribution enrolment is part of the submission transaction, including legacy
-- endpoints and direct-upload draft finalization. No asynchronous follow-up can be lost.
ALTER TABLE organisationUserPolicy ADD COLUMN contribution INTEGER NOT NULL DEFAULT 0 CHECK(contribution IN (0,1));
--> statement-breakpoint
-- Resolve ownership through the persisted Feature/Project chain, never a client org ID.
CREATE TRIGGER task_organisation_user_insert AFTER INSERT ON task
WHEN NEW.isDraft=0 AND NEW.type IN ('newFeature','newPhoto','reportedMissing')
BEGIN
  INSERT INTO organisationRole(organisationId,userId,role,grant)
  SELECT o.id,u.id,'user',json_object('contribution:'||p.id,'user')
  FROM feature f
  JOIN project p ON p.id=f.projectId
  JOIN organisation o ON o.id=p.organisationId
  JOIN organisationUserPolicy policy ON policy.organisationId=o.id
  JOIN user u ON u.id=NEW.contributorId
  WHERE f.id=NEW.featureId AND p.id=NEW.projectId AND o.id=NEW.organisationId
    AND policy.enabled=1 AND policy.contribution=1
    AND o.isPublished=1 AND o.isArchived=0 AND u.isArchived=0 AND u.isAnonymous=0
  ON CONFLICT(organisationId,userId) DO UPDATE
    SET grant=json_patch(organisationRole.grant,excluded.grant);
END;
--> statement-breakpoint
-- Review edits and drafts do not enrol users; the transition to submitted does.
CREATE TRIGGER task_organisation_user_submit AFTER UPDATE OF isDraft ON task
WHEN OLD.isDraft=1 AND NEW.isDraft=0 AND NEW.type IN ('newFeature','newPhoto','reportedMissing')
BEGIN
  INSERT INTO organisationRole(organisationId,userId,role,grant)
  SELECT o.id,u.id,'user',json_object('contribution:'||p.id,'user')
  FROM feature f
  JOIN project p ON p.id=f.projectId
  JOIN organisation o ON o.id=p.organisationId
  JOIN organisationUserPolicy policy ON policy.organisationId=o.id
  JOIN user u ON u.id=NEW.contributorId
  WHERE f.id=NEW.featureId AND p.id=NEW.projectId AND o.id=NEW.organisationId
    AND policy.enabled=1 AND policy.contribution=1
    AND o.isPublished=1 AND o.isArchived=0 AND u.isArchived=0 AND u.isAnonymous=0
  ON CONFLICT(organisationId,userId) DO UPDATE
    SET grant=json_patch(organisationRole.grant,excluded.grant);
END;
