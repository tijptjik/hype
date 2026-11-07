-- Block stale standalone insert/import plans after creation cutover. Atomic form and
-- identity writers assign a server-owned token and initialize revisions in the same batch.
CREATE TRIGGER feature_revision_creation_boundary BEFORE INSERT ON feature
WHEN (SELECT enabled FROM featureRevisionCreationPolicy WHERE singleton=1)=1
 AND NEW.formWriteToken IS NULL
BEGIN SELECT RAISE(ABORT,'Feature creation requires the attributed atomic writer'); END;
