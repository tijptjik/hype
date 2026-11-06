-- A private per-user checkpoint for each canonical changelog owner.
-- This is reading progress, not a resource edit or revision source.
CREATE TABLE userChangelogCheck (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  resourceType TEXT NOT NULL CHECK(resourceType IN ('organisation','project','layer')),
  resourceId TEXT NOT NULL,
  checkedAt TEXT NOT NULL CHECK(checkedAt GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY(userId,resourceType,resourceId)
);
