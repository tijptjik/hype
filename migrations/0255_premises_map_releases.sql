CREATE TABLE premisesMap (
 id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, nameZh TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('station','building')),
 footprint TEXT CHECK(footprint IS NULL OR json_valid(footprint)),
 draftHash TEXT, draftVersion INTEGER NOT NULL DEFAULT 0,
 publishedHash TEXT, publishedVersion INTEGER NOT NULL DEFAULT 0,
 updatedBy TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE premisesMapPublication (
 mapId TEXT NOT NULL REFERENCES premisesMap(id), version INTEGER NOT NULL,
 hash TEXT NOT NULL, actorId TEXT NOT NULL, createdAt TEXT NOT NULL,
 PRIMARY KEY(mapId,version)
);
CREATE INDEX premises_map_publication_hash ON premisesMapPublication(mapId,hash);
CREATE TABLE premisesMapUnit (
 mapId TEXT NOT NULL REFERENCES premisesMap(id), unitId TEXT NOT NULL,
 locationId TEXT NOT NULL REFERENCES location(id), PRIMARY KEY(mapId,unitId)
);
CREATE INDEX premises_map_unit_location ON premisesMapUnit(locationId);
