-- Renderer identities are code-owned; names and SVG previews live in the catalogue.
CREATE TABLE cardStyle (code text PRIMARY KEY NOT NULL);
INSERT INTO cardStyle (code) VALUES ('full'), ('no-description');

-- SQLite permits adding a nullable FK without rebuilding projects and descendants.
-- Null is the durable fallback to Full; new admin submissions explicitly save Full.
ALTER TABLE project ADD COLUMN cardStyleCode text REFERENCES cardStyle(code);
UPDATE project SET cardStyleCode = 'full';
-- Layer overrides use validated metadata.cardStyleCode, like metadata.mapStyleCode.
-- Missing or null layer choices inherit the project's style.
