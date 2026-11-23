-- A field session only records against explicitly vetted Location identities.
CREATE TABLE fieldResearchSessionLocation (
  sessionId TEXT NOT NULL REFERENCES fieldResearchSession(id),
  locationId TEXT NOT NULL REFERENCES location(id),
  PRIMARY KEY (sessionId, locationId)
);
