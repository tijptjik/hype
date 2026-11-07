-- Refs #194. Feature-owned opt-in intent must never be inferred from Location state.
CREATE TABLE locationRematchRun (
  id INTEGER PRIMARY KEY CHECK(id=1),
  publication TEXT,
  generation INTEGER NOT NULL DEFAULT 0,
  cursor TEXT NOT NULL DEFAULT '',
  scanning INTEGER NOT NULL DEFAULT 0,
  checkedAt INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
INSERT INTO locationRematchRun(id) VALUES(1);
CREATE TABLE locationRematchJob (
  id TEXT PRIMARY KEY,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL,
  locationId TEXT NOT NULL REFERENCES location(id),
  intent TEXT NOT NULL,
  baseline TEXT NOT NULL,
  publication TEXT NOT NULL,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','checking','matched','ambiguous','deferred','failed','suppressed')),
  candidates TEXT,
  candidateCursor INTEGER NOT NULL DEFAULT 0,
  incomplete INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(featureId,intent)
);
CREATE INDEX location_rematch_work ON locationRematchJob(generation,status,retryAt,id);
CREATE TABLE locationRematchReview (
  reviewId TEXT PRIMARY KEY REFERENCES locationIdentityReview(id),
  jobId TEXT NOT NULL REFERENCES locationRematchJob(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  ssId TEXT NOT NULL,
  evidence TEXT NOT NULL,
  UNIQUE(jobId,generation,ssId)
);
-- A single predicate is shared by capture, queue projection, retry and acceptance.
CREATE VIEW locationRematchEligible AS
SELECT f.id featureId,f.projectId,fl.locationId,l.ownerOrganisationId,l.kind,
  json_object('modifiedAt',f.modifiedAt,'version',fl.version,'addressMeta',f.addressMeta,
    'projectId',f.projectId,'owner',l.ownerOrganisationId,'kind',l.kind,'locationId',l.id,
    'revisionId',(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1),
    'historyId',(SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=l.id AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))) intent,
  f.addressMeta
FROM feature f JOIN project p ON p.id=f.projectId
JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId
WHERE f.isDraft=0 AND f.isArchived=0 AND l.ssId IS NULL AND l.state IN ('manual','unresolved')
  AND (l.ownerOrganisationId IS NULL OR l.ownerOrganisationId=p.organisationId)
  AND json_extract(f.addressMeta,'$.address.association.mode')='unlinked'
  AND json_extract(f.addressMeta,'$.address.association.kind')=l.kind
  AND NOT EXISTS(SELECT 1 FROM locationRevision lr WHERE lr.locationId=l.id
    AND lr.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
    AND json_extract(lr.rawSource,'$.buildingSource.id') IS NOT NULL)
  AND (json_extract(f.addressMeta,'$.address.association.targetId') IS NULL
    OR json_extract(f.addressMeta,'$.address.association.targetId') IN (l.id,'location:'||l.id));
CREATE VIEW locationRematchCurrent AS
SELECT j.* FROM locationRematchJob j JOIN locationRematchEligible e
  ON e.featureId=j.featureId AND e.projectId=j.projectId AND e.locationId=j.locationId AND e.intent=j.intent
JOIN locationRematchRun run ON run.id=1 AND run.generation=j.generation AND COALESCE(run.lastError,'')!='PUBLICATION_REVIEW_REQUIRED';
