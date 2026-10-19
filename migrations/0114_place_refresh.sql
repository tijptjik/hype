-- Pinned, resumable canonical Place refresh. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE placeRefresh (
  id INTEGER PRIMARY KEY CHECK(id=1),
  phase TEXT NOT NULL DEFAULT 'idle' CHECK(phase IN ('idle','scan','ready','review')),
  accepted TEXT CHECK(accepted IS NULL OR json_valid(accepted)),
  target TEXT CHECK(target IS NULL OR json_valid(target)),
  runId TEXT,
  checkedMonth TEXT,
  nextOffset INTEGER NOT NULL DEFAULT 0 CHECK(nextOffset>=0),
  total INTEGER CHECK(total IS NULL OR total>=0),
  lease TEXT,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
INSERT INTO placeRefresh(id) VALUES(1);
-- Retain source candidates independently of mutable Feature associations.
-- Missing source rows remain explicit, never interpreted as deletion/closure.
CREATE TABLE placeRefreshItem (
  runId TEXT NOT NULL,
  placeId TEXT NOT NULL,
  ssId TEXT NOT NULL,
  sourceOffset INTEGER,
  projection TEXT CHECK(projection IS NULL OR json_valid(projection)),
  status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','pending','processed','review')),
  PRIMARY KEY(runId, placeId),
  UNIQUE(runId, ssId)
);
CREATE INDEX place_refresh_item_work ON placeRefreshItem(runId,status,placeId);
