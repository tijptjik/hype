-- Refs #189, #194. Schema only: user < member < owner, with independent role-grant provenance.
CREATE TABLE organisationUserPolicy (
  organisationId TEXT PRIMARY KEY NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  hubSignIn INTEGER NOT NULL DEFAULT 0 CHECK (hubSignIn IN (0,1)),
  emailDomain TEXT,
  customCard INTEGER NOT NULL DEFAULT 0 CHECK (customCard IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
-- Preserve one effective role per organisation/person; grant explains every independent reason.
ALTER TABLE organisationRole ADD COLUMN grant TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(grant) AND json_type(grant)='object');
--> statement-breakpoint
UPDATE organisationRole SET grant=json_object('manual',role);
--> statement-breakpoint
-- Runtime claim eligibility must survive source deletion without retaining import payloads online.
ALTER TABLE breadlineImportIdentity ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
--> statement-breakpoint
CREATE INDEX organisationRole_user_idx ON organisationRole(userId,organisationId);
--> statement-breakpoint
-- Reject unknown role levels and provenance values at the database boundary.
CREATE TRIGGER organisationRole_validate_insert BEFORE INSERT ON organisationRole
WHEN NEW.role NOT IN ('user','member','owner') OR EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE type<>'text' OR value NOT IN ('user','member','owner') OR key='')
BEGIN SELECT RAISE(ABORT,'invalid organisation role grant'); END;
--> statement-breakpoint
CREATE TRIGGER organisationRole_validate_update BEFORE UPDATE OF role,grant ON organisationRole
WHEN NEW.role NOT IN ('user','member','owner') OR EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE type<>'text' OR value NOT IN ('user','member','owner') OR key='')
BEGIN SELECT RAISE(ABORT,'invalid organisation role grant'); END;
--> statement-breakpoint
-- Legacy inserts without a grant remain explicit manual assignments during staged rollout.
CREATE TRIGGER organisationRole_default_grant AFTER INSERT ON organisationRole
WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.grant))
BEGIN UPDATE organisationRole SET grant=json_object('manual',NEW.role) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
--> statement-breakpoint
-- Derive the effective role from the strongest surviving grant.
CREATE TRIGGER organisationRole_grant_insert AFTER INSERT ON organisationRole
WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant)) AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET role=(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
--> statement-breakpoint
CREATE TRIGGER organisationRole_grant_update AFTER UPDATE OF grant ON organisationRole
WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant)) AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET role=(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
--> statement-breakpoint
-- Keep role-only writes from an older runtime attributable without erasing other grants.
CREATE TRIGGER organisationRole_legacy_role_update AFTER UPDATE OF role ON organisationRole
WHEN NEW.grant=OLD.grant AND NEW.role<>OLD.role AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET grant=json_set(grant,'$.manual',NEW.role) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
--> statement-breakpoint
-- Revocation removes the role only after its final independent reason is gone.
CREATE TRIGGER organisationRole_last_grant AFTER UPDATE OF grant ON organisationRole
WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.grant))
BEGIN DELETE FROM organisationRole WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
