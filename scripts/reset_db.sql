PRAGMA foreign_keys = OFF;

drop table d1_migrations;
drop table account;
drop table session;
drop table geoCollection;
drop table geoFeature;
drop table geoProject;
drop table user;
drop table userActivity;


UPDATE sqlite_sequence
SET seq = 0
WHERE name = 'd1_migrations';