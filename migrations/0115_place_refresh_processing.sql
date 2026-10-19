-- Durable per-Feature outcomes before advancing canonical refresh completion. Refs #194.
-- spec/breadline/proposal/01-places-features.md
ALTER TABLE placeRefreshItem ADD COLUMN revisionId TEXT;
ALTER TABLE placeRefreshItem ADD COLUMN featureCursor TEXT NOT NULL DEFAULT '';
ALTER TABLE placeRefreshItem ADD COLUMN reviewReason TEXT;
CREATE TABLE placeRefreshFeature (
  runId TEXT NOT NULL,
  placeId TEXT NOT NULL,
  featureId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  proposalId TEXT,
  reason TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('processed','review','conflict','unlinked')),
  geometryChanged INTEGER NOT NULL CHECK(geometryChanged IN (0,1)),
  PRIMARY KEY(runId,placeId,featureId)
);
