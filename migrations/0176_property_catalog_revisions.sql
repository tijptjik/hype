-- Additive catalog history. Existing rows enroll on their first attributed catalog save.
CREATE TABLE propertyCatalogRevision (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('organisation','project','hub')),
  resourceId TEXT NOT NULL,
  previousRevisionId TEXT,
  changeSetId TEXT NOT NULL REFERENCES revisionChangeSet(id),
  content TEXT NOT NULL CHECK(json_valid(content)),
  UNIQUE(scope,resourceId,id),
  FOREIGN KEY(scope,resourceId,previousRevisionId) REFERENCES propertyCatalogRevision(scope,resourceId,id)
);
CREATE TABLE propertyCatalogRevisionHead (
  scope TEXT NOT NULL,
  resourceId TEXT NOT NULL,
  currentRevisionId TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  PRIMARY KEY(scope,resourceId),
  FOREIGN KEY(scope,resourceId,currentRevisionId) REFERENCES propertyCatalogRevision(scope,resourceId,id)
);
CREATE TABLE propertyCatalogRevisionWrite (
  scope TEXT NOT NULL,
  resourceId TEXT NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY(scope,resourceId)
);
CREATE TRIGGER property_catalog_revision_update BEFORE UPDATE ON propertyCatalogRevision
BEGIN SELECT RAISE(ABORT,'property catalog revision is immutable'); END;
CREATE TRIGGER property_catalog_revision_delete BEFORE DELETE ON propertyCatalogRevision
BEGIN SELECT RAISE(ABORT,'property catalog revision is immutable'); END;
CREATE TRIGGER property_catalog_head_delete BEFORE DELETE ON propertyCatalogRevisionHead
BEGIN SELECT RAISE(ABORT,'property catalog head must be retained'); END;
CREATE TRIGGER property_catalog_head_update BEFORE UPDATE ON propertyCatalogRevisionHead
WHEN NEW.scope IS NOT OLD.scope OR NEW.resourceId IS NOT OLD.resourceId OR NEW.generation!=OLD.generation+1
BEGIN SELECT RAISE(ABORT,'invalid property catalog head generation'); END;
CREATE TRIGGER property_catalog_guard_insert BEFORE INSERT ON property
WHEN EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=NEW.scope AND h.resourceId=CASE NEW.scope WHEN 'organisation' THEN NEW.organisationId WHEN 'hub' THEN NEW.hubId ELSE NEW.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER property_catalog_guard_update BEFORE UPDATE ON property
WHEN EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=OLD.scope AND h.resourceId=CASE OLD.scope WHEN 'organisation' THEN OLD.organisationId WHEN 'hub' THEN OLD.hubId ELSE OLD.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)) OR EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=NEW.scope AND h.resourceId=CASE NEW.scope WHEN 'organisation' THEN NEW.organisationId WHEN 'hub' THEN NEW.hubId ELSE NEW.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER property_catalog_guard_delete BEFORE DELETE ON property
WHEN EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=OLD.scope AND h.resourceId=CASE OLD.scope WHEN 'organisation' THEN OLD.organisationId WHEN 'hub' THEN OLD.hubId ELSE OLD.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyI18n_catalog_guard_insert BEFORE INSERT ON propertyI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=NEW.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyI18n_catalog_guard_update BEFORE UPDATE ON propertyI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=OLD.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))) OR EXISTS (SELECT 1 FROM property p WHERE p.id=NEW.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyI18n_catalog_guard_delete BEFORE DELETE ON propertyI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=OLD.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValue_catalog_guard_insert BEFORE INSERT ON propertyValue
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=NEW.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValue_catalog_guard_update BEFORE UPDATE ON propertyValue
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=OLD.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))) OR EXISTS (SELECT 1 FROM property p WHERE p.id=NEW.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValue_catalog_guard_delete BEFORE DELETE ON propertyValue
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id=OLD.propertyId AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValueI18n_catalog_guard_insert BEFORE INSERT ON propertyValueI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id IN (SELECT propertyId FROM propertyValue WHERE id=NEW.propertyValueId) AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValueI18n_catalog_guard_update BEFORE UPDATE ON propertyValueI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id IN (SELECT propertyId FROM propertyValue WHERE id=OLD.propertyValueId) AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId))) OR EXISTS (SELECT 1 FROM property p WHERE p.id IN (SELECT propertyId FROM propertyValue WHERE id=NEW.propertyValueId) AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
CREATE TRIGGER propertyValueI18n_catalog_guard_delete BEFORE DELETE ON propertyValueI18n
WHEN EXISTS (SELECT 1 FROM property p WHERE p.id IN (SELECT propertyId FROM propertyValue WHERE id=OLD.propertyValueId) AND EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=p.scope AND h.resourceId=CASE p.scope WHEN 'organisation' THEN p.organisationId WHEN 'hub' THEN p.hubId ELSE p.projectId END AND NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionWrite w WHERE w.scope=h.scope AND w.resourceId=h.resourceId)))
BEGIN SELECT RAISE(ABORT,'property mutation requires catalog capture'); END;
