PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

-- Drop all tables in reverse dependency order based on the current Drizzle schema.
-- Keep child / join tables ahead of the tables they reference.

-- User interaction + task/image joins
DROP TABLE IF EXISTS userFeature;
DROP TABLE IF EXISTS userLayer;
DROP TABLE IF EXISTS hubLayer;
DROP TABLE IF EXISTS hubUserState;
DROP TABLE IF EXISTS taskImage;
DROP TABLE IF EXISTS task;

-- Feature + layer children
DROP TABLE IF EXISTS layerI18n;
DROP TABLE IF EXISTS layerProperty;
DROP TABLE IF EXISTS featureI18n;
DROP TABLE IF EXISTS featureImage;
DROP TABLE IF EXISTS featurePropertyI18n;
DROP TABLE IF EXISTS featureProperty;
DROP TABLE IF EXISTS projectMapStyles;
DROP TABLE IF EXISTS mapStyleI18n;

-- Resource children
DROP TABLE IF EXISTS projectI18n;
DROP TABLE IF EXISTS projectRole;
DROP TABLE IF EXISTS projectProperty;
DROP TABLE IF EXISTS hubProperty;
DROP TABLE IF EXISTS organisationProperty;
DROP TABLE IF EXISTS propertyValueI18n;
DROP TABLE IF EXISTS propertyValue;
DROP TABLE IF EXISTS propertyI18n;

-- Resource roots with upstream dependencies
DROP TABLE IF EXISTS feature;
DROP TABLE IF EXISTS layer;
DROP TABLE IF EXISTS property;
DROP TABLE IF EXISTS project;
DROP TABLE IF EXISTS mapStyles;

-- Organisation + hub children
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS userActivity;
DROP TABLE IF EXISTS hubI18n;
DROP TABLE IF EXISTS hubRole;
DROP TABLE IF EXISTS organisationI18n;
DROP TABLE IF EXISTS organisationRole;

-- Resource roots without remaining dependents
DROP TABLE IF EXISTS organisation;
DROP TABLE IF EXISTS hub;
DROP TABLE IF EXISTS image;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS d1_migrations;

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
