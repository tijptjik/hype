-- Draft, repeatable data migration. Refs #194; spec/breadline/proposal/01-places-features.md.
-- This file is the editable source of truth while donor decisions are reviewed.
-- Execute in one transaction with scripts/breadline/curate-donor-identities.py.
-- Seed names only when absent; never replace catalogue edits or immutable source facts.
-- Unverified group/format relationships remain absent, not an assertion of independence.
CREATE TEMP TABLE _donor_catalogue(code TEXT PRIMARY KEY,id TEXT,kind TEXT,content TEXT);
INSERT INTO _donor_catalogue VALUES
('7eleven','bl-brand-7414c730dd836bb4cddefc9b','brand','{"logo":null,"i18n":{"en":{"name":"7-Eleven"},"zh-Hans":{"name":"7-Eleven"},"zh-Hant":{"name":"7-Eleven"}}}'),
('arome','bl-brand-979304c697eaae04756dd221','brand','{"logo":null,"i18n":{"en":{"name":"Arome"},"zh-Hans":{"name":"东海堂"},"zh-Hant":{"name":"東海堂"}}}'),
('childhood','bl-brand-f2d1ba57ddbb39205c04bc1b','brand','{"logo":null,"i18n":{"en":{"name":"Childhood Bakery"},"zh-Hans":{"name":"Childhood Bakery"},"zh-Hant":{"name":"Childhood Bakery"}}}'),
('deedee','bl-brand-5fdb63561d5d9a409280a050','brand','{"logo":null,"i18n":{"en":{"name":"Dee Dee Bakery"},"zh-Hans":{"name":"Dee Dee Bakery"},"zh-Hant":{"name":"Dee Dee Bakery"}}}'),
('fresh-wheat','bl-brand-6e1c7692996206c63b88a61e','brand','{"logo":null,"i18n":{"en":{"name":"Fresh Wheat Bakery"},"zh-Hans":{"name":"Fresh Wheat Bakery"},"zh-Hant":{"name":"Fresh Wheat Bakery"}}}'),
('garden','bl-brand-23eeb69c681dfdb8eacc7ce9','brand','{"logo":null,"i18n":{"en":{"name":"Garden"},"zh-Hans":{"name":"Garden"},"zh-Hant":{"name":"Garden"}}}'),
('harlans','bl-brand-79cba6910c5a78730c2d9d0f','brand','{"logo":null,"i18n":{"en":{"name":"Harlan’s"},"zh-Hans":{"name":"Harlan’s"},"zh-Hant":{"name":"Harlan’s"}}}'),
('honore','bl-brand-763677987520dd76a27717e9','brand','{"logo":null,"i18n":{"en":{"name":"Saint Honore"},"zh-Hans":{"name":"圣安娜饼屋"},"zh-Hant":{"name":"聖安娜餅屋"}}}'),
('kayser','bl-brand-0299cfcba06f95cb6b30a27f','brand','{"logo":null,"i18n":{"en":{"name":"Maison Kayser"},"zh-Hans":{"name":"Maison Kayser"},"zh-Hant":{"name":"Maison Kayser"}}}'),
('maxims','bl-brand-f92a296e7ea8ebb1653c2f7e','brand','{"logo":null,"i18n":{"en":{"name":"Maxim''s"},"zh-Hans":{"name":"美心西饼"},"zh-Hant":{"name":"美心西餅"}}}'),
('nibbles','bl-brand-6adde6a89e62eace7c1075c6','brand','{"logo":null,"i18n":{"en":{"name":"Nibbles Baking Nook"},"zh-Hans":{"name":"Nibbles Baking Nook"},"zh-Hant":{"name":"Nibbles Baking Nook"}}}'),
('peninsula','bl-brand-85af70cde80552a2dcb84f30','brand','{"logo":null,"i18n":{"en":{"name":"The Peninsula"},"zh-Hans":{"name":"The Peninsula"},"zh-Hant":{"name":"The Peninsula"}}}'),
('wooloomooloo','bl-brand-f6c5535345028c3db0f52253','brand','{"logo":null,"i18n":{"en":{"name":"Wooloomooloo Prime"},"zh-Hans":{"name":"Wooloomooloo Prime"},"zh-Hant":{"name":"Wooloomooloo Prime"}}}'),
('yamazaki','bl-brand-56877aab9e1365c49bc8bd85','brand','{"logo":null,"i18n":{"en":{"name":"Yamazaki"},"zh-Hans":{"name":"山崎面包"},"zh-Hant":{"name":"山崎麵包"}}}'),
('maxims-group','bl-group-maxims-group','group','{"i18n": {"en": {"name": "Maxim''s Group"}, "zh-Hant": {"name": "Maxim''s Group"}, "zh-Hans": {"name": "Maxim''s Group"}}, "logo": null}'),
('dfi','bl-group-dfi','group','{"i18n": {"en": {"name": "DFI Retail Group"}, "zh-Hant": {"name": "DFI Retail Group"}, "zh-Hans": {"name": "DFI Retail Group"}}, "logo": null}'),
('cra','bl-group-cra','group','{"i18n": {"en": {"name": "Convenience Retail Asia"}, "zh-Hant": {"name": "Convenience Retail Asia"}, "zh-Hans": {"name": "Convenience Retail Asia"}}, "logo": null}'),
('yamazaki-group','bl-group-yamazaki-group','group','{"i18n": {"en": {"name": "Yamazaki Baking Co., Ltd."}, "zh-Hant": {"name": "Yamazaki Baking Co., Ltd."}, "zh-Hans": {"name": "Yamazaki Baking Co., Ltd."}}, "logo": null}'),
('hsh','bl-group-hsh','group','{"i18n": {"en": {"name": "The Hongkong and Shanghai Hotels, Limited"}, "zh-Hant": {"name": "The Hongkong and Shanghai Hotels, Limited"}, "zh-Hans": {"name": "The Hongkong and Shanghai Hotels, Limited"}}, "logo": null}'),
('wooloomooloo-group','bl-group-wooloomooloo-group','group','{"i18n": {"en": {"name": "Wooloomooloo Group"}, "zh-Hant": {"name": "Wooloomooloo Group"}, "zh-Hans": {"name": "Wooloomooloo Group"}}, "logo": null}'),
('jc','bl-group-jc','group','{"i18n": {"en": {"name": "JC Group"}, "zh-Hant": {"name": "JC Group"}, "zh-Hans": {"name": "JC Group"}}, "logo": null}');
INSERT INTO identityCatalogue(id,kind,version)
SELECT id,kind,1 FROM _donor_catalogue d WHERE kind='group' OR NOT EXISTS
 (SELECT 1 FROM identityCatalogueSource s WHERE s.source='brand:breadlineBrand' AND s.sourceId=d.code)
ON CONFLICT(id) DO NOTHING;
INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt)
SELECT d.id,1,json_set(d.content,'$.code',d.code),'migration:breadline-donor-identity',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM _donor_catalogue d WHERE EXISTS(SELECT 1 FROM identityCatalogue c WHERE c.id=d.id)
AND NOT EXISTS(SELECT 1 FROM identityCatalogueRevision r WHERE r.catalogueId=d.id);
INSERT INTO identityCatalogueSource(source,sourceId,catalogueId)
SELECT 'brand:breadlineBrand',code,id FROM _donor_catalogue d WHERE kind='brand'
AND EXISTS(SELECT 1 FROM identityCatalogue c WHERE c.id=d.id)
ON CONFLICT(source,sourceId) DO NOTHING;

-- Group is the documented operating affiliation, not an inferred ultimate owner.
-- English fallback in both Chinese locales is explicit until translations are reviewed.
CREATE TEMP TABLE _donor_groups(brandCode TEXT PRIMARY KEY,groupCode TEXT,decisionVersion INTEGER,evidence TEXT);
INSERT INTO _donor_groups VALUES
('maxims','maxims-group',1,'https://www.maxims.com.hk/media/pdf/eng%20pdf/240730press-release-maxims-group-unveils-media-mooncake-tasting-event.pdf'),
('arome','maxims-group',1,'https://www.maxims.com.hk/media/pdf/eng%20pdf/240730press-release-maxims-group-unveils-media-mooncake-tasting-event.pdf'),
('7eleven','dfi',1,'https://www.7-eleven.com.hk/en/about/about-us'),
('honore','cra',1,'https://www.hkexnews.hk/listedco/listconews/sehk/2026/0413/2026041300569.pdf'),
('yamazaki','yamazaki-group',1,'https://www.yamazakipan.co.jp/english/yamazaki_group/index.html'),
('peninsula','hsh',1,'https://www.peninsula.com/en/newsroom/group/news/the-peninsula-hotels-welcomes-julien-munoz-as-cco'),
('wooloomooloo','wooloomooloo-group',1,'https://www.wooloo-mooloo.com/aboutus/'),
('harlans','jc',1,'https://www.the-one.hk/en/shopdirectory/shopdetails.asp?id=1323');
-- Attach the reviewed corporate affiliations to brand catalogue revisions, preserving authored links.
CREATE TEMP TABLE _donor_brand_groups AS
SELECT c.id,c.version,json_set(r.content,'$.groupId',g.id) content
FROM _donor_groups d JOIN identityCatalogueSource source ON source.source='brand:breadlineBrand' AND source.sourceId=d.brandCode
JOIN identityCatalogue c ON c.id=source.catalogueId
JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
JOIN _donor_catalogue g ON g.code=d.groupCode AND g.kind='group'
WHERE json_type(r.content,'$.groupId') IS NULL;
INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt)
SELECT id,version+1,content,'migration:breadline-donor-identity',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM _donor_brand_groups;
UPDATE identityCatalogue SET version=version+1 WHERE id IN (SELECT id FROM _donor_brand_groups);
DROP TABLE _donor_brand_groups;
-- END CATALOGUE SEED
-- Only explicit full storefront formats. No blanket AROME Bakery/Cafe assumption.
-- Prefix is an exact title prefix, not a SQL wildcard; retain raw titles unchanged.
CREATE TEMP TABLE _donor_formats(brandCode TEXT,titlePrefix TEXT,decisionVersion INTEGER,i18n TEXT,evidence TEXT);
INSERT INTO _donor_formats VALUES
('maxims','Maxim''s Cakes - ',1,'{"en":{"value":"Maxim''s Cakes"},"zh-Hant":{"value":"美心西餅"},"zh-Hans":{"value":"美心西饼"}}','Breadline donor title: Maxim''s Cakes - [branch]'),
('wooloomooloo','Wooloomooloo Prime',1,'{"en":{"value":"Wooloomooloo Prime"},"zh-Hant":{"value":"Wooloomooloo Prime"},"zh-Hans":{"value":"Wooloomooloo Prime"}}','https://www.wooloo-mooloo.com/aboutus/');

-- Follow the existing Location identity; never auto-match an upstream place from its name.
CREATE TEMP TABLE _donor_locations AS
SELECT DISTINCT fl.locationId,r.id sourceRevisionId,r.facts,s.sourceId brandCode,
 json_extract(r.facts,'$.i18n.en.name') sourceName
FROM feature f JOIN project p ON p.id=f.projectId AND p.code='breadline'
JOIN featureLocation fl ON fl.featureId=f.id
JOIN location l ON l.id=fl.locationId AND l.state IN ('unresolved','linked')
JOIN locationRevisionContent r ON r.locationId=l.id AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
JOIN locationSharedHead h ON h.locationId=l.id
JOIN identityCatalogueSource s ON s.catalogueId=json_extract(h.corrections,'$.brandId.choice.value') AND s.source='brand:breadlineBrand'
WHERE f.layerId='1msQMcuqfHrP' AND f.isDraft=0;
CREATE TEMP TABLE _donor_changes(locationId TEXT,sourceRevisionId TEXT,field TEXT,decisionVersion INTEGER,value TEXT,catalogue TEXT,original TEXT,evidence TEXT);
INSERT INTO _donor_changes
SELECT l.locationId,l.sourceRevisionId,'groupId',g.decisionVersion,json_quote(c.id),
 json_patch(r.content,json_object('id',c.id,'kind',c.kind,'version',c.version)),
 json_object('present',json('false')),g.evidence
FROM _donor_locations l JOIN _donor_groups g ON g.brandCode=l.brandCode
JOIN _donor_catalogue seed ON seed.code=g.groupCode
JOIN identityCatalogue c ON c.id=seed.id
JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version;
INSERT INTO _donor_changes
SELECT l.locationId,l.sourceRevisionId,'format',f.decisionVersion,json_object('i18n',json(f.i18n)),NULL,
 json_object('present',json(CASE WHEN EXISTS(SELECT 1 FROM json_each(l.facts,'$.i18n') t WHERE json_type(t.value,'$.format')='text') THEN 'true' ELSE 'false' END),
 'value',json((SELECT json_group_object(t.key,json_extract(t.value,'$.format')) FROM json_each(l.facts,'$.i18n') t WHERE json_type(t.value,'$.format')='text'))),f.evidence
FROM _donor_locations l JOIN _donor_formats f ON f.brandCode=l.brandCode
AND substr(l.sourceName,1,length(f.titlePrefix))=f.titlePrefix;

-- Append one revision per field; normal refresh triggers apply consumers' review policies.
-- A repeated decision never reasserts itself over a later editor. Bump decisionVersion
-- only for reviewed changes; even then only this migration's own field can be replaced.
CREATE TEMP TABLE _donor_write AS SELECT c.*,
 'donor-identity:'||c.field||':v'||c.decisionVersion||':'||c.locationId revisionId
FROM _donor_changes c;
INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance)
SELECT w.revisionId,w.locationId,h.id,w.sourceRevisionId,
 json_set(h.corrections,'$.groupId',json_patch(json_object(
 'original',json(coalesce(json_extract(h.corrections,'$.groupId.original'),w.original)),
 'choice',json_object('mode','override','value',json(w.value)),
 'sourceRevisionId',w.sourceRevisionId,'actorId','migration:breadline-donor-identity',
 'editedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now')),json_object('catalogue',json(w.catalogue)))),
 'migration:breadline-donor-identity',json_object('kind','breadline-donor-identity','field',w.field,'decisionVersion',w.decisionVersion,'evidence',w.evidence)
FROM _donor_write w JOIN locationSharedHead h ON h.locationId=w.locationId
LEFT JOIN locationCurationLockHead lock ON lock.locationId=w.locationId
WHERE w.field='groupId' AND coalesce(json_extract(lock.openFields,'$.groupId'),1)=1
AND (json_type(h.corrections,'$.groupId') IS NULL OR json_extract(h.corrections,'$.groupId.actorId')='migration:breadline-donor-identity')
AND NOT EXISTS(SELECT 1 FROM locationSharedRevision WHERE id=w.revisionId);
INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance)
SELECT w.revisionId,w.locationId,h.id,w.sourceRevisionId,
 json_set(h.corrections,'$.format',json_object(
 'original',json(coalesce(json_extract(h.corrections,'$.format.original'),w.original)),
 'choice',json_object('mode','override','value',json(w.value)),
 'sourceRevisionId',w.sourceRevisionId,'actorId','migration:breadline-donor-identity',
 'editedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
 'migration:breadline-donor-identity',json_object('kind','breadline-donor-identity','field',w.field,'decisionVersion',w.decisionVersion,'evidence',w.evidence)
FROM _donor_write w JOIN locationSharedHead h ON h.locationId=w.locationId
LEFT JOIN locationCurationLockHead lock ON lock.locationId=w.locationId
WHERE w.field='format' AND coalesce(json_extract(lock.openFields,'$.format'),1)=1
AND (json_type(h.corrections,'$.format') IS NULL OR json_extract(h.corrections,'$.format.actorId')='migration:breadline-donor-identity')
AND NOT EXISTS(SELECT 1 FROM locationSharedRevision WHERE id=w.revisionId);

-- Retire the unused organisation classifier only after every donor has inherited brands.
-- Abort rather than silently discard any legacy values or unmatched donors.
CREATE TEMP TABLE _donor_retirement_guard(ok INTEGER CHECK(ok=1));
INSERT INTO _donor_retirement_guard SELECT CASE WHEN
 NOT EXISTS(SELECT 1 FROM featureProperty WHERE propertyId='WhWlW8KcN2wq')
 AND NOT EXISTS(SELECT 1 FROM featurePropertyI18n WHERE propertyId='WhWlW8KcN2wq')
 AND NOT EXISTS(SELECT 1 FROM feature f JOIN project p ON p.id=f.projectId AND p.code='breadline'
 LEFT JOIN featureLocation fl ON fl.featureId=f.id LEFT JOIN locationSharedHead h ON h.locationId=fl.locationId
 WHERE f.layerId='1msQMcuqfHrP' AND f.isDraft=0 AND (fl.locationId IS NULL OR json_extract(h.corrections,'$.brandId.choice.value') IS NULL))
 THEN 1 ELSE 0 END;
-- Configuration removal participates in the same immutable resource histories as the editor.
-- Require initialized heads; run revision initialization before this pre-release migration.
CREATE TEMP TABLE _donor_retire_resources(kind TEXT,id TEXT,PRIMARY KEY(kind,id));
INSERT INTO _donor_retire_resources SELECT 'layer',layerId FROM layerProperty WHERE propertyId='WhWlW8KcN2wq';
INSERT INTO _donor_retire_resources SELECT 'project',projectId FROM projectProperty WHERE propertyId='WhWlW8KcN2wq';
INSERT INTO _donor_retire_resources SELECT 'organisation',organisationId FROM organisationProperty WHERE propertyId='WhWlW8KcN2wq';
CREATE TEMP TABLE _donor_retire_catalogue AS SELECT scope,organisationId resourceId FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' AND scope='organisation';
INSERT INTO _donor_retirement_guard SELECT CASE WHEN
 NOT EXISTS(SELECT 1 FROM property WHERE id='WhWlW8KcN2wq' AND (key!='brand' OR scope!='organisation' OR organisationId IS NOT (SELECT id FROM organisation WHERE code='hkfoodworks')))
 AND NOT EXISTS(SELECT 1 FROM _donor_retire_catalogue c WHERE NOT EXISTS(SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope=c.scope AND h.resourceId=c.resourceId))
 THEN 1 ELSE 0 END;
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT 'donor-brand-retirement:v1','migration:breadline-donor-identity','migration','Use Location-derived donor brands',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(SELECT 1 FROM _donor_retire_catalogue);
INSERT INTO propertyCatalogRevisionWrite(scope,resourceId,token)
SELECT scope,resourceId,'donor-brand-retirement:v1' FROM _donor_retire_catalogue;
INSERT INTO _donor_retirement_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _donor_retire_resources c WHERE c.kind='layer' AND NOT EXISTS(SELECT 1 FROM layerRevisionHead h WHERE h.layerId=c.id)) THEN 1 ELSE 0 END;
INSERT INTO layerRevisionWrite(layerId,token,revisionId,baselineRevisionId)
SELECT c.id,'donor-brand-retirement:v1','donor-brand-retirement:v1:layer:'||c.id,h.currentRevisionId
FROM _donor_retire_resources c JOIN layerRevisionHead h ON h.layerId=c.id WHERE c.kind='layer';
INSERT INTO _donor_retirement_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _donor_retire_resources c WHERE c.kind='project' AND NOT EXISTS(SELECT 1 FROM projectRevisionHead h WHERE h.projectId=c.id)) THEN 1 ELSE 0 END;
INSERT INTO projectRevisionWrite(projectId,token,revisionId,baselineRevisionId)
SELECT c.id,'donor-brand-retirement:v1','donor-brand-retirement:v1:project:'||c.id,h.currentRevisionId
FROM _donor_retire_resources c JOIN projectRevisionHead h ON h.projectId=c.id WHERE c.kind='project';
INSERT INTO _donor_retirement_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM _donor_retire_resources c WHERE c.kind='organisation' AND NOT EXISTS(SELECT 1 FROM organisationRevisionHead h WHERE h.organisationId=c.id)) THEN 1 ELSE 0 END;
INSERT INTO organisationRevisionWrite(organisationId,token,revisionId,baselineRevisionId)
SELECT c.id,'donor-brand-retirement:v1','donor-brand-retirement:v1:organisation:'||c.id,h.currentRevisionId
FROM _donor_retire_resources c JOIN organisationRevisionHead h ON h.organisationId=c.id WHERE c.kind='organisation';
DELETE FROM layerProperty WHERE propertyId='WhWlW8KcN2wq';
DELETE FROM projectProperty WHERE propertyId='WhWlW8KcN2wq';
DELETE FROM organisationProperty WHERE propertyId='WhWlW8KcN2wq';
DELETE FROM propertyValueI18n WHERE propertyValueId IN (SELECT id FROM propertyValue WHERE propertyId='WhWlW8KcN2wq');
DELETE FROM propertyValue WHERE propertyId='WhWlW8KcN2wq';
DELETE FROM propertyI18n WHERE propertyId='WhWlW8KcN2wq';
DELETE FROM property WHERE id='WhWlW8KcN2wq' AND key='brand';
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content)
SELECT 'donor-brand-retirement:v1:catalogue:'||h.resourceId,h.scope,h.resourceId,h.currentRevisionId,'donor-brand-retirement:v1',json_remove(r.content,'$.WhWlW8KcN2wq')
FROM _donor_retire_catalogue c JOIN propertyCatalogRevisionHead h ON h.scope=c.scope AND h.resourceId=c.resourceId JOIN propertyCatalogRevision r ON r.id=h.currentRevisionId;
UPDATE propertyCatalogRevisionHead SET currentRevisionId='donor-brand-retirement:v1:catalogue:'||resourceId,generation=generation+1
WHERE (scope,resourceId) IN (SELECT scope,resourceId FROM _donor_retire_catalogue);
DELETE FROM propertyCatalogRevisionWrite WHERE token='donor-brand-retirement:v1';
INSERT INTO layerRevision(id,layerId,previousRevisionId,changeSetId,content)
SELECT 'donor-brand-retirement:v1:layer:'||c.id,c.id,h.currentRevisionId,'donor-brand-retirement:v1',json_remove(r.content,'$.properties.WhWlW8KcN2wq')
FROM _donor_retire_resources c JOIN layerRevisionHead h ON h.layerId=c.id JOIN layerRevision r ON r.id=h.currentRevisionId WHERE c.kind='layer';
UPDATE layerRevisionHead SET currentRevisionId='donor-brand-retirement:v1:layer:'||layerId,generation=generation+1
WHERE layerId IN (SELECT id FROM _donor_retire_resources WHERE kind='layer');
DELETE FROM layerRevisionWrite WHERE token='donor-brand-retirement:v1';
INSERT INTO projectRevision(id,projectId,previousRevisionId,changeSetId,content)
SELECT 'donor-brand-retirement:v1:project:'||c.id,c.id,h.currentRevisionId,'donor-brand-retirement:v1',json_remove(r.content,'$.properties.WhWlW8KcN2wq')
FROM _donor_retire_resources c JOIN projectRevisionHead h ON h.projectId=c.id JOIN projectRevision r ON r.id=h.currentRevisionId WHERE c.kind='project';
UPDATE projectRevisionHead SET currentRevisionId='donor-brand-retirement:v1:project:'||projectId,generation=generation+1
WHERE projectId IN (SELECT id FROM _donor_retire_resources WHERE kind='project');
DELETE FROM projectRevisionWrite WHERE token='donor-brand-retirement:v1';
INSERT INTO organisationRevision(id,organisationId,previousRevisionId,changeSetId,content)
SELECT 'donor-brand-retirement:v1:organisation:'||c.id,c.id,h.currentRevisionId,'donor-brand-retirement:v1',json_remove(r.content,'$.properties.WhWlW8KcN2wq')
FROM _donor_retire_resources c JOIN organisationRevisionHead h ON h.organisationId=c.id JOIN organisationRevision r ON r.id=h.currentRevisionId WHERE c.kind='organisation';
UPDATE organisationRevisionHead SET currentRevisionId='donor-brand-retirement:v1:organisation:'||organisationId,generation=generation+1
WHERE organisationId IN (SELECT id FROM _donor_retire_resources WHERE kind='organisation');
DELETE FROM organisationRevisionWrite WHERE token='donor-brand-retirement:v1';
DROP TABLE _donor_retire_catalogue;
DROP TABLE _donor_retire_resources;
DROP TABLE _donor_retirement_guard;
DROP TABLE _donor_write;
DROP TABLE _donor_changes;
DROP TABLE _donor_locations;
DROP TABLE _donor_formats;
DROP TABLE _donor_groups;
DROP TABLE _donor_catalogue;
