-- Current immutable image selection for resource logos. Historical pins live on snapshots.
CREATE TABLE resourceLogoImageHead (
  imageId TEXT PRIMARY KEY REFERENCES image(id) ON DELETE RESTRICT,
  imageRevisionId TEXT NOT NULL,
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id)
);

CREATE TABLE organisationRevisionLogo (
  revisionId TEXT PRIMARY KEY REFERENCES organisationRevision(id) ON DELETE RESTRICT,
  imageId TEXT NOT NULL,
  imageRevisionId TEXT NOT NULL,
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id)
);
CREATE TRIGGER organisation_revision_logo_capture AFTER INSERT ON organisationRevision
WHEN json_type(NEW.content,'$.logo') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO organisationRevisionLogo(revisionId,imageId,imageRevisionId)
  VALUES(NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId'));
END;
CREATE TRIGGER organisation_revision_logo_no_update BEFORE UPDATE ON organisationRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER organisation_revision_logo_no_delete BEFORE DELETE ON organisationRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;

CREATE TABLE projectRevisionLogo (
  revisionId TEXT PRIMARY KEY REFERENCES projectRevision(id) ON DELETE RESTRICT,
  imageId TEXT NOT NULL,
  imageRevisionId TEXT NOT NULL,
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id)
);
CREATE TRIGGER project_revision_logo_capture AFTER INSERT ON projectRevision
WHEN json_type(NEW.content,'$.logo') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO projectRevisionLogo(revisionId,imageId,imageRevisionId)
  VALUES(NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId'));
END;
CREATE TRIGGER project_revision_logo_no_update BEFORE UPDATE ON projectRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER project_revision_logo_no_delete BEFORE DELETE ON projectRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;

CREATE TABLE hubRevisionLogo (
  revisionId TEXT PRIMARY KEY REFERENCES hubRevision(id) ON DELETE RESTRICT,
  imageId TEXT NOT NULL,
  imageRevisionId TEXT NOT NULL,
  FOREIGN KEY(imageId,imageRevisionId) REFERENCES imageRevision(imageId,id)
);
CREATE TRIGGER hub_revision_logo_capture AFTER INSERT ON hubRevision
WHEN json_type(NEW.content,'$.logo') IS NOT NULL
BEGIN
  SELECT CASE WHEN json_extract(NEW.content,'$.logo.imageId') IS NOT json_extract(NEW.content,'$.record.imageId')
    THEN RAISE(ABORT,'Logo revision identity mismatch') END;
  INSERT INTO hubRevisionLogo(revisionId,imageId,imageRevisionId)
  VALUES(NEW.id,json_extract(NEW.content,'$.logo.imageId'),json_extract(NEW.content,'$.logo.imageRevisionId'));
END;
CREATE TRIGGER hub_revision_logo_no_update BEFORE UPDATE ON hubRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;
CREATE TRIGGER hub_revision_logo_no_delete BEFORE DELETE ON hubRevisionLogo
BEGIN SELECT RAISE(ABORT,'Logo history is immutable'); END;

CREATE TRIGGER resource_logo_head_insert_guard BEFORE INSERT ON resourceLogoImageHead
WHEN EXISTS(SELECT 1 FROM organisation o JOIN organisationRevisionHead h ON h.organisationId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM organisationRevisionWrite w WHERE w.organisationId=o.id)) OR EXISTS(SELECT 1 FROM project o JOIN projectRevisionHead h ON h.projectId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM projectRevisionWrite w WHERE w.projectId=o.id)) OR EXISTS(SELECT 1 FROM hub o JOIN hubRevisionHead h ON h.hubId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM hubRevisionWrite w WHERE w.hubId=o.id))
BEGIN SELECT RAISE(ABORT,'Logo change requires resource history capture'); END;

CREATE TRIGGER resource_logo_head_update_guard BEFORE UPDATE ON resourceLogoImageHead
WHEN EXISTS(SELECT 1 FROM organisation o JOIN organisationRevisionHead h ON h.organisationId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM organisationRevisionWrite w WHERE w.organisationId=o.id)) OR EXISTS(SELECT 1 FROM project o JOIN projectRevisionHead h ON h.projectId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM projectRevisionWrite w WHERE w.projectId=o.id)) OR EXISTS(SELECT 1 FROM hub o JOIN hubRevisionHead h ON h.hubId=o.id WHERE o.imageId=NEW.imageId AND NOT EXISTS(SELECT 1 FROM hubRevisionWrite w WHERE w.hubId=o.id))
BEGIN SELECT RAISE(ABORT,'Logo change requires resource history capture'); END;

CREATE TRIGGER resource_logo_head_delete_guard BEFORE DELETE ON resourceLogoImageHead
WHEN EXISTS(SELECT 1 FROM organisation o JOIN organisationRevisionHead h ON h.organisationId=o.id WHERE o.imageId=OLD.imageId AND NOT EXISTS(SELECT 1 FROM organisationRevisionWrite w WHERE w.organisationId=o.id)) OR EXISTS(SELECT 1 FROM project o JOIN projectRevisionHead h ON h.projectId=o.id WHERE o.imageId=OLD.imageId AND NOT EXISTS(SELECT 1 FROM projectRevisionWrite w WHERE w.projectId=o.id)) OR EXISTS(SELECT 1 FROM hub o JOIN hubRevisionHead h ON h.hubId=o.id WHERE o.imageId=OLD.imageId AND NOT EXISTS(SELECT 1 FROM hubRevisionWrite w WHERE w.hubId=o.id))
BEGIN SELECT RAISE(ABORT,'Logo change requires resource history capture'); END;

CREATE TRIGGER resource_logo_image_write_guard BEFORE UPDATE OF publicId,env,version,contentHash,presentationMode ON image
WHEN EXISTS(SELECT 1 FROM resourceLogoImageHead WHERE imageId=OLD.id)
  AND (NEW.publicId IS NOT OLD.publicId OR NEW.env IS NOT OLD.env OR NEW.version IS NOT OLD.version
    OR NEW.contentHash IS NOT OLD.contentHash OR NEW.presentationMode IS NOT OLD.presentationMode)
  AND (EXISTS(SELECT 1 FROM organisation o WHERE o.imageId=OLD.id AND NOT EXISTS(SELECT 1 FROM organisationRevisionWrite w WHERE w.organisationId=o.id)) OR EXISTS(SELECT 1 FROM project o WHERE o.imageId=OLD.id AND NOT EXISTS(SELECT 1 FROM projectRevisionWrite w WHERE w.projectId=o.id)) OR EXISTS(SELECT 1 FROM hub o WHERE o.imageId=OLD.id AND NOT EXISTS(SELECT 1 FROM hubRevisionWrite w WHERE w.hubId=o.id)))
BEGIN SELECT RAISE(ABORT,'Logo image change requires resource history capture'); END;

-- A retained head cannot change identity or disappear; detach only the resource pointer.
CREATE TRIGGER resource_logo_head_identity BEFORE UPDATE OF imageId ON resourceLogoImageHead
WHEN NEW.imageId IS NOT OLD.imageId
BEGIN SELECT RAISE(ABORT,'Logo head identity is immutable'); END;
CREATE TRIGGER resource_logo_head_retained BEFORE DELETE ON resourceLogoImageHead
BEGIN SELECT RAISE(ABORT,'Logo head is retained'); END;

CREATE TRIGGER organisation_revision_logo_exact BEFORE INSERT ON organisationRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM organisationRevision r WHERE r.id=NEW.revisionId
 AND json_extract(r.content,'$.logo.imageId')=NEW.imageId
 AND json_extract(r.content,'$.logo.imageRevisionId')=NEW.imageRevisionId)
BEGIN SELECT RAISE(ABORT,'Logo pin differs from immutable snapshot'); END;

-- Closing a capture must leave the compatibility projection on its exact selected revision.
CREATE TRIGGER organisation_logo_capture_complete BEFORE DELETE ON organisationRevisionWrite
WHEN EXISTS(SELECT 1 FROM organisation o JOIN image i ON i.id=o.imageId
 JOIN resourceLogoImageHead h ON h.imageId=i.id
 JOIN imageRevision r ON r.id=h.imageRevisionId
 JOIN imageAssetVersion a ON a.id=r.assetVersionId
 WHERE o.id=OLD.organisationId AND (i.publicId IS NOT a.storageKey OR i.env IS NOT a.storageNamespace
 OR i.version IS NOT json_extract(r.metadata,'$.version')))
BEGIN SELECT RAISE(ABORT,'Logo projection differs from selected revision'); END;

CREATE TRIGGER project_revision_logo_exact BEFORE INSERT ON projectRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM projectRevision r WHERE r.id=NEW.revisionId
 AND json_extract(r.content,'$.logo.imageId')=NEW.imageId
 AND json_extract(r.content,'$.logo.imageRevisionId')=NEW.imageRevisionId)
BEGIN SELECT RAISE(ABORT,'Logo pin differs from immutable snapshot'); END;

-- Closing a capture must leave the compatibility projection on its exact selected revision.
CREATE TRIGGER project_logo_capture_complete BEFORE DELETE ON projectRevisionWrite
WHEN EXISTS(SELECT 1 FROM project o JOIN image i ON i.id=o.imageId
 JOIN resourceLogoImageHead h ON h.imageId=i.id
 JOIN imageRevision r ON r.id=h.imageRevisionId
 JOIN imageAssetVersion a ON a.id=r.assetVersionId
 WHERE o.id=OLD.projectId AND (i.publicId IS NOT a.storageKey OR i.env IS NOT a.storageNamespace
 OR i.version IS NOT json_extract(r.metadata,'$.version')))
BEGIN SELECT RAISE(ABORT,'Logo projection differs from selected revision'); END;

CREATE TRIGGER hub_revision_logo_exact BEFORE INSERT ON hubRevisionLogo
WHEN NOT EXISTS(SELECT 1 FROM hubRevision r WHERE r.id=NEW.revisionId
 AND json_extract(r.content,'$.logo.imageId')=NEW.imageId
 AND json_extract(r.content,'$.logo.imageRevisionId')=NEW.imageRevisionId)
BEGIN SELECT RAISE(ABORT,'Logo pin differs from immutable snapshot'); END;

-- Closing a capture must leave the compatibility projection on its exact selected revision.
CREATE TRIGGER hub_logo_capture_complete BEFORE DELETE ON hubRevisionWrite
WHEN EXISTS(SELECT 1 FROM hub o JOIN image i ON i.id=o.imageId
 JOIN resourceLogoImageHead h ON h.imageId=i.id
 JOIN imageRevision r ON r.id=h.imageRevisionId
 JOIN imageAssetVersion a ON a.id=r.assetVersionId
 WHERE o.id=OLD.hubId AND (i.publicId IS NOT a.storageKey OR i.env IS NOT a.storageNamespace
 OR i.version IS NOT json_extract(r.metadata,'$.version')))
BEGIN SELECT RAISE(ABORT,'Logo projection differs from selected revision'); END;
