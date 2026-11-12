-- Refs #178. Searchable catalogue translation projection.
-- Catalogue autocomplete searches explicit current names, not version-history JSON.
CREATE TABLE identityCatalogueI18n (
 catalogueId TEXT NOT NULL REFERENCES identityCatalogue(id),
 locale TEXT NOT NULL,
 name TEXT NOT NULL,
 PRIMARY KEY(catalogueId,locale)
);
CREATE INDEX identity_catalogue_i18n_name ON identityCatalogueI18n(name COLLATE NOCASE,catalogueId);
INSERT INTO identityCatalogueI18n SELECT c.id,t.key,json_extract(t.value,'$.name') FROM identityCatalogue c JOIN identityCatalogueRevision r ON r.catalogueId=c.id AND r.version=c.version,json_each(r.content,'$.i18n') t;
CREATE TRIGGER identity_catalogue_i18n_revision AFTER INSERT ON identityCatalogueRevision
WHEN EXISTS(SELECT 1 FROM identityCatalogue c WHERE c.id=NEW.catalogueId AND c.version=NEW.version)
BEGIN
 DELETE FROM identityCatalogueI18n WHERE catalogueId=NEW.catalogueId;
 INSERT INTO identityCatalogueI18n SELECT NEW.catalogueId,t.key,json_extract(t.value,'$.name') FROM json_each(NEW.content,'$.i18n') t;
END;
CREATE TRIGGER identity_catalogue_i18n_head AFTER UPDATE OF version ON identityCatalogue BEGIN
 DELETE FROM identityCatalogueI18n WHERE catalogueId=NEW.id;
 INSERT INTO identityCatalogueI18n SELECT NEW.id,t.key,json_extract(t.value,'$.name') FROM identityCatalogueRevision r,json_each(r.content,'$.i18n') t WHERE r.catalogueId=NEW.id AND r.version=NEW.version;
END;
