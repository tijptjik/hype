-- Working survey surfaces; source premises maps and their publication state remain independent.
CREATE TABLE IF NOT EXISTS fieldRecorderMap (
  sessionId TEXT NOT NULL REFERENCES fieldRecorderConfig(sessionId),
  buildingId TEXT NOT NULL REFERENCES location(id),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL CHECK(json_valid(data)),
  updatedBy TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY(sessionId,buildingId)
);
