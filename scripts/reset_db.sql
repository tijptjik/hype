PRAGMA foreign_keys = OFF;

-- drop table IF EXISTS sqlite_sequence;
drop table IF EXISTS d1_migrations;
drop table IF EXISTS account;
drop table IF EXISTS feature;
drop table IF EXISTS featureI18n;
drop table IF EXISTS featureProperty;
drop table IF EXISTS featurePropertyI18n;
drop table IF EXISTS layer;
drop table IF EXISTS layerI18n;
drop table IF EXISTS layerProperty;
drop table IF EXISTS organisationI18n;
drop table IF EXISTS organisationRole;
drop table IF EXISTS projectI18n;
drop table IF EXISTS projectRole;
drop table IF EXISTS property;
drop table IF EXISTS propertyI18n;
drop table IF EXISTS propertyValue;
drop table IF EXISTS propertyValueI18n;
drop table IF EXISTS session;
drop table IF EXISTS user;
drop table IF EXISTS userActivity;
drop table IF EXISTS featureImage;
drop table IF EXISTS task;
drop table IF EXISTS userFeature;
drop table IF EXISTS organisation;
drop table IF EXISTS project;
drop table IF EXISTS image;

UPDATE sqlite_sequence
SET seq = 0
WHERE name = 'd1_migrations';

PRAGMA foreign_keys = ON;
