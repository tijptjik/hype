PRAGMA foreign_keys = OFF;

drop table IF EXISTS d1_migrations;
drop table IF EXISTS account;
drop table IF EXISTS session;
drop table IF EXISTS user;
drop table IF EXISTS layer;
drop table IF EXISTS feature;
drop table IF EXISTS project;
drop table IF EXISTS userActivity;
drop table IF EXISTS organisation;
drop table IF EXISTS organisationI18n;
drop table IF EXISTS organisationRole;


UPDATE sqlite_sequence
SET seq = 0
WHERE name = 'd1_migrations';

PRAGMA foreign_keys = ON;
