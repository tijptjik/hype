-- Asset bytes must be finalized at a new immutable object key before registration.
-- Existing mutable upload/rotation paths are not silently enrolled by this migration.
CREATE TABLE imageAssetVersion (
  id TEXT PRIMARY KEY NOT NULL,
  imageId TEXT NOT NULL REFERENCES image(id) ON DELETE RESTRICT,
  storageNamespace TEXT NOT NULL,
  storageKey TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  mediaType TEXT NOT NULL,
  byteSize INTEGER NOT NULL CHECK(byteSize >= 0),
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  UNIQUE(imageId,id),
  UNIQUE(storageNamespace,storageKey)
);
CREATE TABLE imageRevision (
  id TEXT PRIMARY KEY NOT NULL,
  imageId TEXT NOT NULL REFERENCES image(id) ON DELETE RESTRICT,
  previousRevisionId TEXT,
  assetVersionId TEXT NOT NULL,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  metadata TEXT NOT NULL CHECK(json_valid(metadata)),
  UNIQUE(imageId,id),
  FOREIGN KEY(imageId,assetVersionId) REFERENCES imageAssetVersion(imageId,id),
  FOREIGN KEY(imageId,previousRevisionId) REFERENCES imageRevision(imageId,id)
);
CREATE TABLE featureRevisionImage (
  featureRevisionId TEXT NOT NULL REFERENCES featureRevision(id) ON DELETE RESTRICT,
  imageId TEXT NOT NULL,
  imageRevisionId TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  intent TEXT NOT NULL,
  PRIMARY KEY(featureRevisionId,imageId),
  UNIQUE(featureRevisionId,position),
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id)
);
CREATE UNIQUE INDEX feature_revision_image_canonical ON featureRevisionImage(featureRevisionId) WHERE intent='canonical';
CREATE TRIGGER image_revision_existing_parent BEFORE INSERT ON imageRevision
WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM imageRevision WHERE id=NEW.previousRevisionId AND imageId=NEW.imageId)
BEGIN SELECT RAISE(ABORT,'image revision predecessor missing'); END;

-- Galleries have one canonical representation in the snapshot. Relational pins are
-- generated immediately, so callers cannot forget image history or disagree on order.
CREATE TRIGGER feature_revision_gallery BEFORE INSERT ON featureRevision
WHEN json_type(NEW.content,'$.gallery') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_type(NEW.content,'$.gallery') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.entries') IS NOT 'object'
    OR json_type(NEW.content,'$.gallery.order') IS NOT 'array'
    OR json_array_length(NEW.content,'$.gallery.order') != (SELECT count(*) FROM json_each(NEW.content,'$.gallery.entries'))
    OR EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.order') o
      WHERE o.type!='text' OR NOT EXISTS (SELECT 1 FROM json_each(NEW.content,'$.gallery.entries') e WHERE e.key=o.value))
  THEN RAISE(ABORT,'invalid revision gallery') END;
END;
CREATE TRIGGER feature_revision_gallery_pins AFTER INSERT ON featureRevision
WHEN json_type(NEW.content,'$.gallery')='object'
BEGIN
  INSERT INTO featureRevisionImage(featureRevisionId,imageId,imageRevisionId,position,intent)
  SELECT NEW.id,e.key,json_extract(e.value,'$.imageRevisionId'),CAST(o.key AS INTEGER),json_extract(e.value,'$.intent')
  FROM json_each(NEW.content,'$.gallery.entries') e
  JOIN json_each(NEW.content,'$.gallery.order') o ON o.value=e.key;
END;
CREATE TRIGGER feature_revision_gallery_exact BEFORE INSERT ON featureRevisionImage
WHEN NOT EXISTS (
  SELECT 1 FROM featureRevision r,json_each(r.content,'$.gallery.entries') e,json_each(r.content,'$.gallery.order') o
  WHERE r.id=NEW.featureRevisionId AND e.key=NEW.imageId AND o.value=e.key
    AND CAST(o.key AS INTEGER)=NEW.position
    AND json_extract(e.value,'$.imageRevisionId')=NEW.imageRevisionId
    AND json_extract(e.value,'$.intent')=NEW.intent
)
BEGIN SELECT RAISE(ABORT,'gallery pin differs from immutable snapshot'); END;
CREATE TRIGGER imageAssetVersion_immutable_update BEFORE UPDATE ON imageAssetVersion
BEGIN SELECT RAISE(ABORT,'imageAssetVersion is immutable'); END;
CREATE TRIGGER imageAssetVersion_immutable_delete BEFORE DELETE ON imageAssetVersion
BEGIN SELECT RAISE(ABORT,'imageAssetVersion is immutable'); END;
CREATE TRIGGER imageRevision_immutable_update BEFORE UPDATE ON imageRevision
BEGIN SELECT RAISE(ABORT,'imageRevision is immutable'); END;
CREATE TRIGGER imageRevision_immutable_delete BEFORE DELETE ON imageRevision
BEGIN SELECT RAISE(ABORT,'imageRevision is immutable'); END;
CREATE TRIGGER featureRevisionImage_immutable_update BEFORE UPDATE ON featureRevisionImage
BEGIN SELECT RAISE(ABORT,'featureRevisionImage is immutable'); END;
CREATE TRIGGER featureRevisionImage_immutable_delete BEFORE DELETE ON featureRevisionImage
BEGIN SELECT RAISE(ABORT,'featureRevisionImage is immutable'); END;
