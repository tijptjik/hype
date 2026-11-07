-- Approved maintenance of an unpublished Feature is attributed without a publication receipt.
CREATE TABLE featurePrivateCapture (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
 featureId TEXT NOT NULL REFERENCES feature(id),
 revisionId TEXT NOT NULL UNIQUE,
 generation INTEGER NOT NULL CHECK(generation>=0),
 FOREIGN KEY(featureId,revisionId) REFERENCES featureRevision(featureId,id)
);
CREATE INDEX feature_private_capture_head ON featurePrivateCapture(featureId,generation,sequence);
CREATE TRIGGER feature_private_capture_scope BEFORE INSERT ON featurePrivateCapture
WHEN NOT EXISTS(SELECT 1 FROM featureRevisionHead h JOIN feature f ON f.id=h.featureId
 WHERE h.featureId=NEW.featureId AND h.state='active' AND h.publishedRevisionId IS NULL
 AND h.generation=NEW.generation AND f.isPublished=0)
BEGIN SELECT RAISE(ABORT,'Private capture requires an unpublished active Feature'); END;
CREATE TRIGGER feature_private_capture_no_update BEFORE UPDATE ON featurePrivateCapture BEGIN SELECT RAISE(ABORT,'Private captures are immutable'); END;
CREATE TRIGGER feature_private_capture_no_delete BEFORE DELETE ON featurePrivateCapture BEGIN SELECT RAISE(ABORT,'Private captures are immutable'); END;
