-- Optional current group membership, with immutable history retained in revision content.
ALTER TABLE identityCatalogue ADD COLUMN groupId TEXT REFERENCES identityCatalogue(id);
CREATE INDEX identity_catalogue_group ON identityCatalogue(groupId);

-- Every member may reference only a group; recursive traversal prevents indirect cycles.
CREATE TRIGGER identity_catalogue_group_update BEFORE UPDATE OF groupId ON identityCatalogue
WHEN NEW.groupId IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identityCatalogue WHERE id=NEW.groupId AND kind='group')
   THEN RAISE(ABORT,'CATALOGUE_GROUP_REQUIRED') END;
 SELECT CASE WHEN EXISTS(
   WITH RECURSIVE ancestors(id) AS (
     SELECT NEW.groupId
     UNION
     SELECT c.groupId FROM identityCatalogue c JOIN ancestors a ON c.id=a.id WHERE c.groupId IS NOT NULL
   ) SELECT 1 FROM ancestors WHERE id=NEW.id
 ) THEN RAISE(ABORT,'CATALOGUE_GROUP_CYCLE') END;
END;
CREATE TRIGGER identity_catalogue_group_insert BEFORE INSERT ON identityCatalogue
WHEN NEW.groupId IS NOT NULL
BEGIN
 SELECT CASE WHEN NEW.groupId=NEW.id THEN RAISE(ABORT,'CATALOGUE_GROUP_CYCLE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identityCatalogue WHERE id=NEW.groupId AND kind='group')
   THEN RAISE(ABORT,'CATALOGUE_GROUP_REQUIRED') END;
END;

-- Backfill existing brand links without rewriting any retained revision.
UPDATE identityCatalogue SET groupId=(
 SELECT json_extract(r.content,'$.groupId') FROM identityCatalogueRevision r
 WHERE r.catalogueId=identityCatalogue.id AND r.version=identityCatalogue.version
);

-- New identities insert their first revision after the head; later saves advance the head last.
CREATE TRIGGER identity_catalogue_group_revision AFTER INSERT ON identityCatalogueRevision
WHEN EXISTS(SELECT 1 FROM identityCatalogue WHERE id=NEW.catalogueId AND version=NEW.version)
BEGIN
 UPDATE identityCatalogue SET groupId=json_extract(NEW.content,'$.groupId') WHERE id=NEW.catalogueId;
END;
CREATE TRIGGER identity_catalogue_group_head AFTER UPDATE OF version ON identityCatalogue
BEGIN
 UPDATE identityCatalogue SET groupId=(
   SELECT json_extract(content,'$.groupId') FROM identityCatalogueRevision
   WHERE catalogueId=NEW.id AND version=NEW.version
 ) WHERE id=NEW.id;
END;
