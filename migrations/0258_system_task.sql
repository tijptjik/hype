-- System issues have no invented Feature/Project ancestry; only super admins read or review them.
CREATE TABLE systemTask (
  id TEXT PRIMARY KEY NOT NULL,
  resource TEXT NOT NULL CHECK(resource IN ('location','premisesMap')),
  resourceId TEXT NOT NULL,
  type TEXT NOT NULL,
  sourceSnapshotHash TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  isReviewed INTEGER NOT NULL DEFAULT 0,
  reviewOutcome TEXT CHECK(reviewOutcome IN ('accepted','rejected')),
  reviewerId TEXT REFERENCES user(id),
  createdAt TEXT NOT NULL,
  modifiedAt TEXT NOT NULL
);
CREATE INDEX systemTask_queue ON systemTask(isReviewed,resource,modifiedAt);
