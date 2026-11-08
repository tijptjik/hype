-- Separate verified asset staging from resource attachment; retain terminal receipts for replay safety.
CREATE TABLE imageUpload (
  imageId TEXT PRIMARY KEY NOT NULL,
  actorId TEXT NOT NULL,
  ctxType TEXT NOT NULL CHECK (ctxType IN ('user','project','organisation','hub')),
  ctxId TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','attached','discarded')),
  expiresAt INTEGER NOT NULL,
  data TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  evidence TEXT,
  selectedUrl TEXT
);
CREATE INDEX image_upload_expiry_idx ON imageUpload(actorId,state,expiresAt);
