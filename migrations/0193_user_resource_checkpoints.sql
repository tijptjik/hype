-- Generalize private per-user progress without changing existing changelog cutoffs.
CREATE TABLE userResourceCheckpoint (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  resourceType TEXT NOT NULL CHECK(resourceType IN ('location','organisation','project','layer','feature','task','hub','property','user')),
  resourceId TEXT NOT NULL,
  checkpointKind TEXT NOT NULL CHECK(length(trim(checkpointKind)) > 0),
  checkedThrough TEXT NOT NULL CHECK(checkedThrough GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY(userId,resourceType,resourceId,checkpointKind)
);

INSERT INTO userResourceCheckpoint(userId,resourceType,resourceId,checkpointKind,checkedThrough)
SELECT userId,resourceType,resourceId,'changelog',checkedAt FROM userChangelogCheck;

-- The old table is removed only after all existing rows have been copied successfully.
DROP TABLE userChangelogCheck;
