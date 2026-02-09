PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

-- BEGIN TRANSACTION;

-- Drop all tables in reverse dependency order (Level 4 → Level 0)
-- Level 4: Depends on Level 3
DROP TABLE IF EXISTS userFeature;
DROP TABLE IF EXISTS userLayer;
DROP TABLE IF EXISTS task;
DROP TABLE IF EXISTS taskImage;

-- Level 3: Depends on Level 2
DROP TABLE IF EXISTS layer;
DROP TABLE IF EXISTS layerI18n;
DROP TABLE IF EXISTS layerProperty;
DROP TABLE IF EXISTS feature;
DROP TABLE IF EXISTS featureI18n;
DROP TABLE IF EXISTS featureImage;
DROP TABLE IF EXISTS featureProperty;
DROP TABLE IF EXISTS featurePropertyI18n;

-- Level 2: Depends on Level 1
DROP TABLE IF EXISTS project;
DROP TABLE IF EXISTS projectI18n;
DROP TABLE IF EXISTS projectRole;
DROP TABLE IF EXISTS property;
DROP TABLE IF EXISTS propertyI18n;
DROP TABLE IF EXISTS propertyValue;
DROP TABLE IF EXISTS propertyValueI18n;

-- Level 1: Depends on Level 0
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS userActivity;
DROP TABLE IF EXISTS hubI18n;
DROP TABLE IF EXISTS hubRole;
DROP TABLE IF EXISTS organisation;
DROP TABLE IF EXISTS organisationI18n;
DROP TABLE IF EXISTS organisationRole;

-- Level 0: Independent tables
DROP TABLE IF EXISTS d1_migrations;
DROP TABLE IF EXISTS hub;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS image;
DROP TABLE IF EXISTS verification;

-- Recreate d1_migrations table to ensure sqlite_sequence exists
-- CREATE TABLE IF NOT EXISTS d1_migrations(
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT UNIQUE,
--   applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
-- );

-- Reset the sequence counter if sqlite_sequence exists
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'd1_migrations' AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence');

-- COMMIT;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = OFF;
