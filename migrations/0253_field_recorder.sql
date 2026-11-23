-- Private Field Recorder demo staging; no existing Features or properties are rewritten.
CREATE TABLE IF NOT EXISTS fieldRecorderConfig (
  sessionId TEXT PRIMARY KEY NOT NULL REFERENCES fieldResearchSession(id),
  settings TEXT NOT NULL CHECK(json_valid(settings)), revision INTEGER NOT NULL DEFAULT 0,
  nextPreliminary INTEGER NOT NULL DEFAULT 1, nextFinal INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS fieldRecorder_code ON fieldRecorderConfig(json_extract(settings,'$.code'));
CREATE TABLE IF NOT EXISTS fieldRecorderRecord (
  id TEXT PRIMARY KEY NOT NULL, sessionId TEXT NOT NULL REFERENCES fieldRecorderConfig(sessionId),
  preliminaryNumber INTEGER NOT NULL, finalNumber INTEGER,
  revision INTEGER NOT NULL DEFAULT 0, contributorId TEXT NOT NULL, updatedBy TEXT NOT NULL,
  content TEXT NOT NULL CHECK(json_valid(content)), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fieldRecorder_preliminary ON fieldRecorderRecord(sessionId, preliminaryNumber);
CREATE UNIQUE INDEX IF NOT EXISTS fieldRecorder_final ON fieldRecorderRecord(sessionId, finalNumber);
CREATE TABLE IF NOT EXISTS fieldRecorderAudio (
  id TEXT PRIMARY KEY NOT NULL, sessionId TEXT NOT NULL REFERENCES fieldRecorderConfig(sessionId),
  storageKey TEXT NOT NULL, mediaType TEXT NOT NULL, env TEXT NOT NULL, contributorId TEXT NOT NULL
);
