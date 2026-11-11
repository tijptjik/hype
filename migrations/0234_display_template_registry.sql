-- Refs #178; spec/breadline/proposal/01-places-features.md.
-- Central definitions retain immutable locale-specific versions. No existing naming rule is rewritten.
CREATE TABLE displayTemplate (
  id TEXT PRIMARY KEY NOT NULL,
  organisationId TEXT REFERENCES organisation(id),
  code TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  FOREIGN KEY(id,version) REFERENCES displayTemplateRevision(templateId,version) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX displayTemplate_community_code ON displayTemplate(code) WHERE organisationId IS NULL;
CREATE UNIQUE INDEX displayTemplate_organisation_code ON displayTemplate(organisationId,code) WHERE organisationId IS NOT NULL;
CREATE TABLE displayTemplateRevision (
  templateId TEXT NOT NULL REFERENCES displayTemplate(id),
  version INTEGER NOT NULL CHECK(version > 0),
  definition TEXT NOT NULL CHECK(json_valid(definition)),
  actorId TEXT NOT NULL REFERENCES user(id),
  createdAt TEXT NOT NULL,
  PRIMARY KEY(templateId,version)
);
CREATE TRIGGER displayTemplateRevision_immutable_update BEFORE UPDATE ON displayTemplateRevision
BEGIN SELECT RAISE(ABORT,'Display template history is immutable'); END;
CREATE TRIGGER displayTemplateRevision_immutable_delete BEFORE DELETE ON displayTemplateRevision
BEGIN SELECT RAISE(ABORT,'Display template history is immutable'); END;
CREATE TRIGGER displayTemplate_identity_immutable BEFORE UPDATE OF id,organisationId,code ON displayTemplate
BEGIN SELECT RAISE(ABORT,'Display template identity is immutable'); END;
