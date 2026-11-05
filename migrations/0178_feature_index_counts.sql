-- Filtered admin counts reuse revision-keyed aggregates and maintained status bins.
-- Install before the filtered index reader; never cache relation predicates without these invalidations.
CREATE INDEX IF NOT EXISTS feature_index_organisation ON feature(organisationId, isArchived, isPublished, isDraft, id, isVisitable, isIntangible, isPendingReview, layerId, projectId);
CREATE INDEX IF NOT EXISTS feature_index_project ON feature(projectId, isArchived, isPublished, isDraft, id, isVisitable, isIntangible, isPendingReview, layerId, organisationId);
CREATE INDEX IF NOT EXISTS feature_index_layer ON feature(layerId, isArchived, isPublished, isDraft, id, isVisitable, isIntangible, isPendingReview, organisationId, projectId);
CREATE TRIGGER feature_index_revision_featureImage_insert AFTER INSERT ON featureImage BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featureImage_update AFTER UPDATE ON featureImage BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featureImage_delete AFTER DELETE ON featureImage BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featurePropertyI18n_insert AFTER INSERT ON featurePropertyI18n BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featurePropertyI18n_update AFTER UPDATE ON featurePropertyI18n BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featurePropertyI18n_delete AFTER DELETE ON featurePropertyI18n BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_property_insert AFTER INSERT ON property BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_property_update AFTER UPDATE ON property BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_property_delete AFTER DELETE ON property BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_feature_fields AFTER UPDATE OF isPendingReview, contributorId ON feature BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_featureI18n_fields AFTER UPDATE OF titleGen, descriptionGen, displayAddressGen ON featureI18n BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_project_fields AFTER UPDATE OF license ON project BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER feature_index_revision_user_fields AFTER UPDATE OF name ON user BEGIN
  UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
END;
-- Invalidate entries computed before the wider dependency contract.
UPDATE featureCountRevision SET revision = revision + 1 WHERE id = 1;
