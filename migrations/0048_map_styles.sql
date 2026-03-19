PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "mapStyles" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "modifiedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS "projectMapStyles" (
  "projectId" TEXT NOT NULL,
  "mapStyleKey" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "modifiedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY ("projectId"),
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY ("mapStyleKey") REFERENCES "mapStyles"("key") ON UPDATE cascade ON DELETE restrict
);

INSERT INTO "mapStyles" ("key", "label", "description")
VALUES
  ('ghostery', 'Ghostery', 'Legacy Hype app basemap with blue roads and Ghostery labels.'),
  ('protomaps', 'Spectral Protomaps', 'Protomaps-backed Spectral basemap for migration previews.')
ON CONFLICT("key") DO UPDATE SET
  "label" = excluded."label",
  "description" = excluded."description",
  "modifiedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

COMMIT;
