-- Additive contracts preserve existing text, phone arrays and classifier identities.
ALTER TABLE property ADD COLUMN dataType TEXT NOT NULL DEFAULT 'text' CHECK(dataType IN ('text','number','date','boolean','link'));
ALTER TABLE property ADD COLUMN cardinality TEXT NOT NULL DEFAULT 'one' CHECK(cardinality IN ('one','many'));
ALTER TABLE property ADD COLUMN presentation TEXT NOT NULL DEFAULT 'text' CHECK(presentation IN ('text','labelledLinks','numberedReferences'));
ALTER TABLE property ADD COLUMN audience TEXT NOT NULL DEFAULT 'public' CHECK(audience IN ('public','internal'));
ALTER TABLE featureProperty ADD COLUMN valueJson TEXT CHECK(valueJson IS NULL OR (json_valid(valueJson) AND value IS NULL AND propertyValueId IS NULL));
-- ISBN remains an editorial reference, omitted from public payloads as well as cards.
UPDATE property SET audience='internal',isUserContributable=0 WHERE id='eln_isbn' AND projectId='vGBvWfSZNELM' AND key='isbn';
