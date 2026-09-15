
PRAGMA foreign_keys = ON;
CREATE TABLE user (id TEXT PRIMARY KEY);
CREATE TABLE hub (id TEXT PRIMARY KEY, code TEXT, domain TEXT);
CREATE TABLE organisation (id TEXT PRIMARY KEY, code TEXT, hubId TEXT REFERENCES hub(id) ON DELETE SET NULL ON UPDATE CASCADE,
  isHubExclusive INTEGER DEFAULT 0, isCoreInclusive INTEGER DEFAULT 1, isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT, organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE layer (id TEXT PRIMARY KEY, organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  projectId TEXT REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE, isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE feature (id TEXT PRIMARY KEY, organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  layerId TEXT NOT NULL REFERENCES layer(id) ON DELETE CASCADE ON UPDATE CASCADE,
  isPublished INTEGER NOT NULL DEFAULT 1, isArchived INTEGER NOT NULL DEFAULT 0, isDraft INTEGER NOT NULL DEFAULT 0,
  isVisitable INTEGER NOT NULL DEFAULT 1, isIntangible INTEGER NOT NULL DEFAULT 0,
  geometry TEXT NOT NULL DEFAULT '{"type":"Point","coordinates":[114.17,22.32]}', modifiedAt TEXT DEFAULT 'original-version');
CREATE TABLE featureI18n (featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, locale TEXT,
  title TEXT, description TEXT, displayAddress TEXT, addressProperties TEXT, PRIMARY KEY(featureId,locale));
CREATE TABLE property (id TEXT PRIMARY KEY);
CREATE TABLE propertyValue (id TEXT PRIMARY KEY, propertyId TEXT REFERENCES property(id) ON DELETE CASCADE);
CREATE TABLE featureProperty (featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  propertyId TEXT REFERENCES property(id) ON DELETE CASCADE, propertyValueId TEXT REFERENCES propertyValue(id) ON DELETE SET NULL,
  value TEXT, PRIMARY KEY(featureId,propertyId));
CREATE TABLE userFeature (userId TEXT REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE,
  featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, isWishlisted INTEGER DEFAULT 0,
  isVisited INTEGER DEFAULT 0, visitedAt TEXT, PRIMARY KEY(userId,featureId));
CREATE TABLE hubRole (hubId TEXT REFERENCES hub(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
CREATE TABLE organisationRole (organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
CREATE TABLE projectRole (projectId TEXT REFERENCES project(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
INSERT INTO user VALUES ('user-1'),('user-2');
INSERT INTO hub(id,code,domain) VALUES ('hub-1','hub-one','one.test');
INSERT INTO organisation(id,code) VALUES ('org-1','org-one'),('org-2','org-two');
INSERT INTO project(id,code,organisationId) VALUES ('project-1','project-one','org-1'),('project-2','project-two','org-2');
INSERT INTO layer(id,organisationId,projectId) VALUES ('layer-1','org-1','project-1'),('layer-2','org-2','project-2');
INSERT INTO property VALUES ('property-1');
INSERT INTO propertyValue VALUES ('value-1','property-1');
