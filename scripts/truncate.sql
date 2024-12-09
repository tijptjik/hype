-- Defer foreign key enforcement in this transaction.
PRAGMA defer_foreign_keys = on;

DELETE FROM account;
DELETE FROM feature;
DELETE FROM featureI18n;
DELETE FROM featureProperty;
DELETE FROM featurePropertyI18n;
DELETE FROM layer;
DELETE FROM layerI18n;
DELETE FROM layerProperty;
DELETE FROM organisationI18n;
DELETE FROM organisationRole;
DELETE FROM projectI18n;
DELETE FROM projectRole;
DELETE FROM property;
DELETE FROM propertyI18n;
DELETE FROM propertyValue;
DELETE FROM propertyValueI18n;
DELETE FROM session;
DELETE FROM user;
DELETE FROM userActivity;
DELETE FROM featureImage;
DELETE FROM image;
DELETE FROM task;
DELETE FROM userFeature;
DELETE FROM organisation;
DELETE FROM project;