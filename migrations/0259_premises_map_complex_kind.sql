-- Allow explicitly classified complex maps without reclassifying any existing map or Location.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE premisesMap_next (
 id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, nameZh TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('station','building','complex')),
 footprint TEXT CHECK(footprint IS NULL OR json_valid(footprint)),
 draftHash TEXT, draftVersion INTEGER NOT NULL DEFAULT 0,
 publishedHash TEXT, publishedVersion INTEGER NOT NULL DEFAULT 0,
 updatedBy TEXT NOT NULL, updatedAt TEXT NOT NULL
);
INSERT INTO premisesMap_next SELECT * FROM premisesMap;
DROP TABLE premisesMap;
ALTER TABLE premisesMap_next RENAME TO premisesMap;
PRAGMA defer_foreign_keys=OFF;
