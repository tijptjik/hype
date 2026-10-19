-- Refs #213, #194. Server-owned walking access, refreshed on every geometry change.
ALTER TABLE feature ADD COLUMN mtrStation TEXT;
ALTER TABLE feature ADD COLUMN mtrExit TEXT;
ALTER TABLE feature ADD COLUMN mtrDistance INTEGER CHECK (mtrDistance IS NULL OR mtrDistance >= 0);
ALTER TABLE feature ADD COLUMN mtrResolution TEXT CHECK (mtrResolution IS NULL OR json_valid(mtrResolution));

CREATE TABLE featureMtrJob (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  geometry TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
CREATE INDEX featureMtrJob_due ON featureMtrJob(retryAt, leaseUntil);
CREATE TRIGGER feature_mtr_insert AFTER INSERT ON feature BEGIN
  INSERT INTO featureMtrJob(featureId,geometry) VALUES (NEW.id,NEW.geometry);
END;
CREATE TRIGGER feature_mtr_geometry AFTER UPDATE OF geometry ON feature
WHEN NEW.geometry IS NOT OLD.geometry BEGIN
  UPDATE feature SET mtrStation=NULL,mtrExit=NULL,mtrDistance=NULL,mtrResolution=NULL WHERE id=NEW.id;
  INSERT INTO featureMtrJob(featureId,geometry) VALUES (NEW.id,NEW.geometry)
  ON CONFLICT(featureId) DO UPDATE SET geometry=excluded.geometry,attempts=0,retryAt=0,leaseUntil=0,lastError=NULL;
END;
INSERT INTO featureMtrJob(featureId,geometry) SELECT id,geometry FROM feature;
