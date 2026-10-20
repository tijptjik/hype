-- Durable publisher evidence, independent of canonical Place adoption. Refs #194.
-- spec/breadline/proposal/01-places-features.md
CREATE TABLE placeSourceTransition (
  id TEXT PRIMARY KEY,
  fromPublication TEXT CHECK(fromPublication IS NULL OR json_valid(fromPublication)),
  toPublication TEXT NOT NULL CHECK(json_valid(toPublication)),
  phase TEXT NOT NULL DEFAULT 'queued' CHECK(phase IN ('queued','collect','complete','review')),
  inventories TEXT CHECK(inventories IS NULL OR json_valid(inventories)),
  plan TEXT CHECK(plan IS NULL OR json_valid(plan)),
  lease TEXT,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  retryAt INTEGER NOT NULL DEFAULT 0,
  lastError TEXT,
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX place_source_transition_work ON placeSourceTransition(phase,retryAt,createdAt);
CREATE TABLE placeSourceComparison (
  id TEXT PRIMARY KEY,
  transitionId TEXT NOT NULL REFERENCES placeSourceTransition(id) ON DELETE RESTRICT,
  datasetCode TEXT NOT NULL,
  resourceType TEXT NOT NULL,
  sourceVariant TEXT NOT NULL,
  fromRelease TEXT NOT NULL,
  toRelease TEXT NOT NULL,
  pin TEXT CHECK(pin IS NULL OR json_valid(pin)),
  cursor TEXT,
  pageNumber INTEGER NOT NULL DEFAULT 0 CHECK(pageNumber>=0),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)),
  added INTEGER NOT NULL DEFAULT 0 CHECK(added>=0),
  changed INTEGER NOT NULL DEFAULT 0 CHECK(changed>=0),
  removed INTEGER NOT NULL DEFAULT 0 CHECK(removed>=0),
  UNIQUE(transitionId,datasetCode,resourceType),
  CHECK(fromRelease<>toRelease)
);
CREATE INDEX place_source_comparison_work ON placeSourceComparison(transitionId,complete,id);
CREATE TABLE placeSourcePage (
  comparisonId TEXT NOT NULL REFERENCES placeSourceComparison(id) ON DELETE RESTRICT,
  pageNumber INTEGER NOT NULL CHECK(pageNumber>=0),
  requestCursor TEXT NOT NULL,
  nextCursor TEXT,
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  PRIMARY KEY(comparisonId,pageNumber),
  UNIQUE(comparisonId,requestCursor),
  UNIQUE(comparisonId,nextCursor)
);
CREATE TABLE placeSourceEvidenceId (
  comparisonId TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  pageNumber INTEGER NOT NULL,
  PRIMARY KEY(comparisonId,sourceRecordId),
  FOREIGN KEY(comparisonId,pageNumber) REFERENCES placeSourcePage(comparisonId,pageNumber) ON DELETE RESTRICT
);
-- Evidence cannot be edited after its cursor has advanced.
CREATE TRIGGER place_source_page_immutable_update BEFORE UPDATE ON placeSourcePage BEGIN SELECT RAISE(ABORT,'Place source evidence is immutable'); END;
CREATE TRIGGER place_source_page_immutable_delete BEFORE DELETE ON placeSourcePage BEGIN SELECT RAISE(ABORT,'Place source evidence is immutable'); END;
CREATE TRIGGER place_source_id_immutable_update BEFORE UPDATE ON placeSourceEvidenceId BEGIN SELECT RAISE(ABORT,'Place source evidence is immutable'); END;
CREATE TRIGGER place_source_id_immutable_delete BEFORE DELETE ON placeSourceEvidenceId BEGIN SELECT RAISE(ABORT,'Place source evidence is immutable'); END;
-- Preserve an in-flight canonical transition when upgrading an existing worker.
INSERT INTO placeSourceTransition(id,fromPublication,toPublication)
SELECT runId,accepted,target FROM placeRefresh WHERE phase IN ('scan','ready') AND runId IS NOT NULL AND target IS NOT NULL;
