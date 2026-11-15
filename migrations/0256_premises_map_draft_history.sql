CREATE TABLE premisesMapDraftRevision (
 mapId TEXT NOT NULL REFERENCES premisesMap(id), version INTEGER NOT NULL,
 hash TEXT NOT NULL, actorId TEXT NOT NULL, createdAt TEXT NOT NULL,
 PRIMARY KEY(mapId,version)
);
INSERT INTO premisesMapDraftRevision(mapId,version,hash,actorId,createdAt)
SELECT id,draftVersion,draftHash,updatedBy,updatedAt FROM premisesMap WHERE draftHash IS NOT NULL;
