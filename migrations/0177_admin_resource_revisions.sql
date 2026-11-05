-- Storage may be installed for read-only demonstrations. Enable capture only after
-- publication, ancestry, property and image writers are migrated and rehearsed.
CREATE TABLE adminResourceRevisionRollout (
  resource TEXT PRIMARY KEY NOT NULL CHECK(resource IN ('project','layer','hub')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
INSERT INTO adminResourceRevisionRollout(resource,enabled)
VALUES ('project',0),('layer',0),('hub',0);
-- Enrolment occurs atomically on the first attributed application mutation, not by
-- inventing authors for old records. Existing un-enrolled records are untouched.
CREATE TABLE projectRevision (
  id TEXT PRIMARY KEY NOT NULL,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  content TEXT NOT NULL CHECK(json_valid(content)),
  schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion=1),
  UNIQUE(projectId,id),
  FOREIGN KEY(projectId,previousRevisionId) REFERENCES projectRevision(projectId,id)
);
CREATE TABLE projectRevisionHead (
  projectId TEXT PRIMARY KEY NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  currentRevisionId TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  FOREIGN KEY(projectId,currentRevisionId) REFERENCES projectRevision(projectId,id)
);
CREATE TABLE projectRevisionWrite (
  projectId TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  baselineRevisionId TEXT NOT NULL
);
CREATE TRIGGER project_revision_existing_parent BEFORE INSERT ON projectRevision
WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM projectRevision WHERE id=NEW.previousRevisionId AND projectId=NEW.projectId
)
BEGIN SELECT RAISE(ABORT,'project revision predecessor missing'); END;
CREATE TRIGGER project_revision_immutable_update BEFORE UPDATE ON projectRevision
BEGIN SELECT RAISE(ABORT,'project revision is immutable'); END;
CREATE TRIGGER project_revision_immutable_delete BEFORE DELETE ON projectRevision
BEGIN SELECT RAISE(ABORT,'project revision is immutable'); END;
CREATE TRIGGER project_revision_head_generation BEFORE UPDATE ON projectRevisionHead
WHEN NEW.projectId IS NOT OLD.projectId OR NEW.generation!=OLD.generation+1
BEGIN SELECT RAISE(ABORT,'invalid project head generation'); END;
CREATE TRIGGER project_revision_head_delete BEFORE DELETE ON projectRevisionHead
BEGIN SELECT RAISE(ABORT,'project revision head must be retained'); END;
CREATE TRIGGER project_revision_guard_update BEFORE UPDATE ON project
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.id) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.id)) OR (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.id) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.id))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER project_revision_guard_delete BEFORE DELETE ON project
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.id) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.id))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectI18n_revision_guard_insert BEFORE INSERT ON projectI18n
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectI18n_revision_guard_update BEFORE UPDATE ON projectI18n
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId)) OR (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectI18n_revision_guard_delete BEFORE DELETE ON projectI18n
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectProperty_revision_guard_insert BEFORE INSERT ON projectProperty
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectProperty_revision_guard_update BEFORE UPDATE ON projectProperty
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId)) OR (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectProperty_revision_guard_delete BEFORE DELETE ON projectProperty
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectMapStyles_revision_guard_insert BEFORE INSERT ON projectMapStyles
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectMapStyles_revision_guard_update BEFORE UPDATE ON projectMapStyles
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId)) OR (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=NEW.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;
CREATE TRIGGER projectMapStyles_revision_guard_delete BEFORE DELETE ON projectMapStyles
WHEN (EXISTS (SELECT 1 FROM projectRevisionHead WHERE projectId=OLD.projectId) AND NOT EXISTS (SELECT 1 FROM projectRevisionWrite WHERE projectId=OLD.projectId))
BEGIN SELECT RAISE(ABORT,'project mutation requires revision capture'); END;

-- Enrolment occurs atomically on the first attributed application mutation, not by
-- inventing authors for old records. Existing un-enrolled records are untouched.
CREATE TABLE layerRevision (
  id TEXT PRIMARY KEY NOT NULL,
  layerId TEXT NOT NULL REFERENCES layer(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  content TEXT NOT NULL CHECK(json_valid(content)),
  schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion=1),
  UNIQUE(layerId,id),
  FOREIGN KEY(layerId,previousRevisionId) REFERENCES layerRevision(layerId,id)
);
CREATE TABLE layerRevisionHead (
  layerId TEXT PRIMARY KEY NOT NULL REFERENCES layer(id) ON DELETE RESTRICT,
  currentRevisionId TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  FOREIGN KEY(layerId,currentRevisionId) REFERENCES layerRevision(layerId,id)
);
CREATE TABLE layerRevisionWrite (
  layerId TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  baselineRevisionId TEXT NOT NULL
);
CREATE TRIGGER layer_revision_existing_parent BEFORE INSERT ON layerRevision
WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM layerRevision WHERE id=NEW.previousRevisionId AND layerId=NEW.layerId
)
BEGIN SELECT RAISE(ABORT,'layer revision predecessor missing'); END;
CREATE TRIGGER layer_revision_immutable_update BEFORE UPDATE ON layerRevision
BEGIN SELECT RAISE(ABORT,'layer revision is immutable'); END;
CREATE TRIGGER layer_revision_immutable_delete BEFORE DELETE ON layerRevision
BEGIN SELECT RAISE(ABORT,'layer revision is immutable'); END;
CREATE TRIGGER layer_revision_head_generation BEFORE UPDATE ON layerRevisionHead
WHEN NEW.layerId IS NOT OLD.layerId OR NEW.generation!=OLD.generation+1
BEGIN SELECT RAISE(ABORT,'invalid layer head generation'); END;
CREATE TRIGGER layer_revision_head_delete BEFORE DELETE ON layerRevisionHead
BEGIN SELECT RAISE(ABORT,'layer revision head must be retained'); END;
CREATE TRIGGER layer_revision_guard_update BEFORE UPDATE ON layer
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.id) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.id)) OR (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=NEW.id) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=NEW.id))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layer_revision_guard_delete BEFORE DELETE ON layer
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.id) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.id))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerI18n_revision_guard_insert BEFORE INSERT ON layerI18n
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=NEW.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=NEW.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerI18n_revision_guard_update BEFORE UPDATE ON layerI18n
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.layerId)) OR (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=NEW.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=NEW.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerI18n_revision_guard_delete BEFORE DELETE ON layerI18n
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerProperty_revision_guard_insert BEFORE INSERT ON layerProperty
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=NEW.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=NEW.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerProperty_revision_guard_update BEFORE UPDATE ON layerProperty
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.layerId)) OR (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=NEW.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=NEW.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;
CREATE TRIGGER layerProperty_revision_guard_delete BEFORE DELETE ON layerProperty
WHEN (EXISTS (SELECT 1 FROM layerRevisionHead WHERE layerId=OLD.layerId) AND NOT EXISTS (SELECT 1 FROM layerRevisionWrite WHERE layerId=OLD.layerId))
BEGIN SELECT RAISE(ABORT,'layer mutation requires revision capture'); END;

-- Enrolment occurs atomically on the first attributed application mutation, not by
-- inventing authors for old records. Existing un-enrolled records are untouched.
CREATE TABLE hubRevision (
  id TEXT PRIMARY KEY NOT NULL,
  hubId TEXT NOT NULL REFERENCES hub(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  content TEXT NOT NULL CHECK(json_valid(content)),
  schemaVersion INTEGER NOT NULL DEFAULT 1 CHECK(schemaVersion=1),
  UNIQUE(hubId,id),
  FOREIGN KEY(hubId,previousRevisionId) REFERENCES hubRevision(hubId,id)
);
CREATE TABLE hubRevisionHead (
  hubId TEXT PRIMARY KEY NOT NULL REFERENCES hub(id) ON DELETE RESTRICT,
  currentRevisionId TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  FOREIGN KEY(hubId,currentRevisionId) REFERENCES hubRevision(hubId,id)
);
CREATE TABLE hubRevisionWrite (
  hubId TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  baselineRevisionId TEXT NOT NULL
);
CREATE TRIGGER hub_revision_existing_parent BEFORE INSERT ON hubRevision
WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM hubRevision WHERE id=NEW.previousRevisionId AND hubId=NEW.hubId
)
BEGIN SELECT RAISE(ABORT,'hub revision predecessor missing'); END;
CREATE TRIGGER hub_revision_immutable_update BEFORE UPDATE ON hubRevision
BEGIN SELECT RAISE(ABORT,'hub revision is immutable'); END;
CREATE TRIGGER hub_revision_immutable_delete BEFORE DELETE ON hubRevision
BEGIN SELECT RAISE(ABORT,'hub revision is immutable'); END;
CREATE TRIGGER hub_revision_head_generation BEFORE UPDATE ON hubRevisionHead
WHEN NEW.hubId IS NOT OLD.hubId OR NEW.generation!=OLD.generation+1
BEGIN SELECT RAISE(ABORT,'invalid hub head generation'); END;
CREATE TRIGGER hub_revision_head_delete BEFORE DELETE ON hubRevisionHead
BEGIN SELECT RAISE(ABORT,'hub revision head must be retained'); END;
CREATE TRIGGER hub_revision_guard_update BEFORE UPDATE ON hub
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.id) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.id)) OR (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.id) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.id))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hub_revision_guard_delete BEFORE DELETE ON hub
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.id) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.id))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubI18n_revision_guard_insert BEFORE INSERT ON hubI18n
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubI18n_revision_guard_update BEFORE UPDATE ON hubI18n
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId)) OR (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubI18n_revision_guard_delete BEFORE DELETE ON hubI18n
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubProperty_revision_guard_insert BEFORE INSERT ON hubProperty
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubProperty_revision_guard_update BEFORE UPDATE ON hubProperty
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId)) OR (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubProperty_revision_guard_delete BEFORE DELETE ON hubProperty
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubLayer_revision_guard_insert BEFORE INSERT ON hubLayer
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubLayer_revision_guard_update BEFORE UPDATE ON hubLayer
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId)) OR (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=NEW.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=NEW.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
CREATE TRIGGER hubLayer_revision_guard_delete BEFORE DELETE ON hubLayer
WHEN (EXISTS (SELECT 1 FROM hubRevisionHead WHERE hubId=OLD.hubId) AND NOT EXISTS (SELECT 1 FROM hubRevisionWrite WHERE hubId=OLD.hubId))
BEGIN SELECT RAISE(ABORT,'hub mutation requires revision capture'); END;
