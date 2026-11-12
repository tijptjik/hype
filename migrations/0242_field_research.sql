-- Retained private capture sessions; a layer is selected only when a stack becomes a Feature.
CREATE TABLE fieldResearchSession (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  organisationId TEXT NOT NULL REFERENCES organisation(id),
  projectId TEXT NOT NULL REFERENCES project(id),
  createdBy TEXT NOT NULL REFERENCES user(id),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','organising','completed')),
  revision INTEGER NOT NULL DEFAULT 0,
  west REAL, south REAL, east REAL, north REAL
);
CREATE INDEX field_research_session_scope ON fieldResearchSession(organisationId, projectId, createdAt);
CREATE TABLE fieldResearchStack (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id),
  longitude REAL, latitude REAL,
  featureId TEXT UNIQUE REFERENCES feature(id),
  createdAt TEXT NOT NULL,
  UNIQUE(sessionId,id)
);
CREATE TABLE fieldResearchImage (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id),
  stackId TEXT,
  state TEXT NOT NULL CHECK(state IN ('uploading','uploaded')),
  filename TEXT NOT NULL,
  longitude REAL, latitude REAL,
  capturedAt TEXT,
  contentHash TEXT NOT NULL,
  storageKey TEXT NOT NULL UNIQUE,
  env TEXT NOT NULL,
  mediaType TEXT NOT NULL,
  byteSize INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(sessionId,stackId) REFERENCES fieldResearchStack(sessionId,id)
);
CREATE INDEX field_research_image_page ON fieldResearchImage(sessionId,id);
CREATE INDEX field_research_image_stack ON fieldResearchImage(stackId,state);
-- The origin key determines the originId namespace. Only server-owned workflows write provenance.
CREATE TABLE featureOrigin (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id),
  origin TEXT NOT NULL,
  originId TEXT,
  recordedAt TEXT NOT NULL,
  recordedBy TEXT REFERENCES user(id)
);
CREATE INDEX feature_origin_lookup ON featureOrigin(origin,originId,featureId);
CREATE TRIGGER feature_origin_immutable BEFORE UPDATE ON featureOrigin
BEGIN SELECT RAISE(ABORT, 'Feature creation provenance is immutable'); END;
