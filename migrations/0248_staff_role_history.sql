-- Staff assignment evidence is append-only; role projections remain authoritative.
CREATE TABLE staffRoleHistoryContext (
 token TEXT PRIMARY KEY NOT NULL, actorId TEXT NOT NULL, origin TEXT NOT NULL,
 reason TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE staffRoleHistory (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 batchId TEXT NOT NULL, resource TEXT NOT NULL CHECK(resource IN ('hub','organisation','project')),
 resourceId TEXT NOT NULL, userId TEXT NOT NULL, subjectLabel TEXT NOT NULL,
 actorId TEXT NOT NULL, origin TEXT NOT NULL, reason TEXT, createdAt TEXT NOT NULL,
 baseline INTEGER NOT NULL DEFAULT 0, beforeValue TEXT, afterValue TEXT
);
CREATE INDEX staff_role_history_scope ON staffRoleHistory(resource,resourceId,seq);
CREATE INDEX staff_role_history_batch ON staffRoleHistory(batchId,resource,resourceId,userId,seq);
CREATE TRIGGER staff_role_history_immutable_update BEFORE UPDATE ON staffRoleHistory BEGIN
 SELECT RAISE(ABORT,'Staff role history is immutable');
END;
CREATE TRIGGER staff_role_history_immutable_delete BEFORE DELETE ON staffRoleHistory BEGIN
 SELECT RAISE(ABORT,'Staff role history is immutable');
END;

-- Existing assignments are a baseline, never reconstructed grants.
INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue) SELECT 'baseline:hub:'||r.hubId,'hub',r.hubId,r.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=r.userId),r.userId),'system:staff-role-baseline','migration','Staff assignments at start of tracking',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,NULL,json_object('role',r.role) FROM hubRole r WHERE (json_object('role',r.role)) IS NOT NULL;
CREATE TRIGGER hubRole_staff_history_insert AFTER INSERT ON hubRole
WHEN (NULL) IS NOT (json_object('role',NEW.role))
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'hub',NEW.hubId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,NULL,json_object('role',NEW.role);
END;
CREATE TRIGGER hubRole_staff_history_update AFTER UPDATE ON hubRole
WHEN (json_object('role',OLD.role)) IS NOT (json_object('role',NEW.role))
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'hub',NEW.hubId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,json_object('role',OLD.role),json_object('role',NEW.role);
END;
CREATE TRIGGER hubRole_staff_history_delete AFTER DELETE ON hubRole
WHEN (json_object('role',OLD.role)) IS NOT (NULL)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'hub',OLD.hubId,OLD.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=OLD.userId),OLD.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,json_object('role',OLD.role),NULL;
END;

-- Existing assignments are a baseline, never reconstructed grants.
INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue) SELECT 'baseline:organisation:'||r.organisationId,'organisation',r.organisationId,r.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=r.userId),r.userId),'system:staff-role-baseline','migration','Staff assignments at start of tracking',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,NULL,CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN r.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(r.grant) WHERE value IN ('owner','member') ORDER BY key)))) END FROM organisationRole r WHERE (CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(r.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN r.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(r.grant) WHERE value IN ('owner','member') ORDER BY key)))) END) IS NOT NULL;
CREATE TRIGGER organisationRole_staff_history_insert AFTER INSERT ON organisationRole
WHEN (NULL) IS NOT (CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN NEW.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(NEW.grant) WHERE value IN ('owner','member') ORDER BY key)))) END)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'organisation',NEW.organisationId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,NULL,CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN NEW.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(NEW.grant) WHERE value IN ('owner','member') ORDER BY key)))) END;
END;
CREATE TRIGGER organisationRole_staff_history_update AFTER UPDATE ON organisationRole
WHEN (CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN OLD.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(OLD.grant) WHERE value IN ('owner','member') ORDER BY key)))) END) IS NOT (CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN NEW.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(NEW.grant) WHERE value IN ('owner','member') ORDER BY key)))) END)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'organisation',NEW.organisationId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN OLD.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(OLD.grant) WHERE value IN ('owner','member') ORDER BY key)))) END,CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN NEW.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(NEW.grant) WHERE value IN ('owner','member') ORDER BY key)))) END;
END;
CREATE TRIGGER organisationRole_staff_history_delete AFTER DELETE ON organisationRole
WHEN (CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN OLD.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(OLD.grant) WHERE value IN ('owner','member') ORDER BY key)))) END) IS NOT (NULL)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'organisation',OLD.organisationId,OLD.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=OLD.userId),OLD.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,CASE WHEN (CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END) IS NOT NULL THEN json_object('role',(CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(OLD.grant) WHERE value='member') THEN 'member' END),'viewAnalytics',json(CASE WHEN OLD.viewAnalytics THEN 'true' ELSE 'false' END),'grants',json((SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(OLD.grant) WHERE value IN ('owner','member') ORDER BY key)))) END,NULL;
END;

-- Existing assignments are a baseline, never reconstructed grants.
INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue) SELECT 'baseline:project:'||r.projectId,'project',r.projectId,r.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=r.userId),r.userId),'system:staff-role-baseline','migration','Staff assignments at start of tracking',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,NULL,CASE WHEN r.role <> 'user' THEN json_object('role',r.role,'capabilities',json(COALESCE(r.capabilities,'{}'))) END FROM projectRole r WHERE (CASE WHEN r.role <> 'user' THEN json_object('role',r.role,'capabilities',json(COALESCE(r.capabilities,'{}'))) END) IS NOT NULL;
CREATE TRIGGER projectRole_staff_history_insert AFTER INSERT ON projectRole
WHEN (NULL) IS NOT (CASE WHEN NEW.role <> 'user' THEN json_object('role',NEW.role,'capabilities',json(COALESCE(NEW.capabilities,'{}'))) END)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'project',NEW.projectId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,NULL,CASE WHEN NEW.role <> 'user' THEN json_object('role',NEW.role,'capabilities',json(COALESCE(NEW.capabilities,'{}'))) END;
END;
CREATE TRIGGER projectRole_staff_history_update AFTER UPDATE ON projectRole
WHEN (CASE WHEN OLD.role <> 'user' THEN json_object('role',OLD.role,'capabilities',json(COALESCE(OLD.capabilities,'{}'))) END) IS NOT (CASE WHEN NEW.role <> 'user' THEN json_object('role',NEW.role,'capabilities',json(COALESCE(NEW.capabilities,'{}'))) END)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'project',NEW.projectId,NEW.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=NEW.userId),NEW.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,CASE WHEN OLD.role <> 'user' THEN json_object('role',OLD.role,'capabilities',json(COALESCE(OLD.capabilities,'{}'))) END,CASE WHEN NEW.role <> 'user' THEN json_object('role',NEW.role,'capabilities',json(COALESCE(NEW.capabilities,'{}'))) END;
END;
CREATE TRIGGER projectRole_staff_history_delete AFTER DELETE ON projectRole
WHEN (CASE WHEN OLD.role <> 'user' THEN json_object('role',OLD.role,'capabilities',json(COALESCE(OLD.capabilities,'{}'))) END) IS NOT (NULL)
BEGIN
 INSERT INTO staffRoleHistory(batchId,resource,resourceId,userId,subjectLabel,actorId,origin,reason,createdAt,baseline,beforeValue,afterValue)
 SELECT COALESCE((SELECT token FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),lower(hex(randomblob(16)))),
 'project',OLD.projectId,OLD.userId,COALESCE((SELECT CASE WHEN username IS NOT NULL THEN '@'||COALESCE(displayUsername,username) ELSE name END FROM user WHERE id=OLD.userId),OLD.userId),
 COALESCE((SELECT actorId FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system:unattributed-role-write'),
 COALESCE((SELECT origin FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),'system'),
 (SELECT reason FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),
 COALESCE((SELECT createdAt FROM staffRoleHistoryContext ORDER BY rowid LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 0,CASE WHEN OLD.role <> 'user' THEN json_object('role',OLD.role,'capabilities',json(COALESCE(OLD.capabilities,'{}'))) END,NULL;
END;
