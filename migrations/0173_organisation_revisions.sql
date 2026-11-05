-- Enrolment occurs atomically on the first attributed application mutation, not by
-- inventing authors for old records. Existing un-enrolled records are untouched.
CREATE TABLE organisationRevision (
  id TEXT PRIMARY KEY NOT NULL,
  organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  content TEXT NOT NULL CHECK(json_valid(content)),
  schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion=1),
  UNIQUE(organisationId,id),
  FOREIGN KEY(organisationId,previousRevisionId) REFERENCES organisationRevision(organisationId,id)
);
CREATE TABLE organisationRevisionHead (
  organisationId TEXT PRIMARY KEY NOT NULL REFERENCES organisation(id) ON DELETE RESTRICT,
  currentRevisionId TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  FOREIGN KEY(organisationId,currentRevisionId) REFERENCES organisationRevision(organisationId,id)
);
CREATE TABLE organisationRevisionWrite (
  organisationId TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  baselineRevisionId TEXT NOT NULL
);
CREATE TRIGGER organisation_revision_existing_parent BEFORE INSERT ON organisationRevision
WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM organisationRevision WHERE id=NEW.previousRevisionId AND organisationId=NEW.organisationId
)
BEGIN SELECT RAISE(ABORT,'organisation revision predecessor missing'); END;
CREATE TRIGGER organisation_revision_immutable_update BEFORE UPDATE ON organisationRevision
BEGIN SELECT RAISE(ABORT,'organisation revision is immutable'); END;
CREATE TRIGGER organisation_revision_immutable_delete BEFORE DELETE ON organisationRevision
BEGIN SELECT RAISE(ABORT,'organisation revision is immutable'); END;
CREATE TRIGGER organisation_revision_head_generation BEFORE UPDATE ON organisationRevisionHead
WHEN NEW.organisationId IS NOT OLD.organisationId OR NEW.generation!=OLD.generation+1
BEGIN SELECT RAISE(ABORT,'invalid organisation head generation'); END;
CREATE TRIGGER organisation_revision_head_delete BEFORE DELETE ON organisationRevisionHead
BEGIN SELECT RAISE(ABORT,'organisation revision head must be retained'); END;
CREATE TRIGGER organisation_revision_guard_update BEFORE UPDATE ON organisation
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.id) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.id)) OR (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.id) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.id))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisation_revision_guard_delete BEFORE DELETE ON organisation
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.id) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.id))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationI18n_revision_guard_insert BEFORE INSERT ON organisationI18n
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationI18n_revision_guard_update BEFORE UPDATE ON organisationI18n
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId)) OR (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationI18n_revision_guard_delete BEFORE DELETE ON organisationI18n
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationUserPolicy_revision_guard_insert BEFORE INSERT ON organisationUserPolicy
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationUserPolicy_revision_guard_update BEFORE UPDATE ON organisationUserPolicy
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId)) OR (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationUserPolicy_revision_guard_delete BEFORE DELETE ON organisationUserPolicy
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationProperty_revision_guard_insert BEFORE INSERT ON organisationProperty
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationProperty_revision_guard_update BEFORE UPDATE ON organisationProperty
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId)) OR (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=NEW.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=NEW.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
CREATE TRIGGER organisationProperty_revision_guard_delete BEFORE DELETE ON organisationProperty
WHEN (EXISTS (SELECT 1 FROM organisationRevisionHead WHERE organisationId=OLD.organisationId) AND NOT EXISTS (SELECT 1 FROM organisationRevisionWrite WHERE organisationId=OLD.organisationId))
BEGIN SELECT RAISE(ABORT,'organisation mutation requires revision capture'); END;
