-- Refs #194. Active catalogue release snapshot; apply after 0245 via D1 migrations.
-- Archived identities are excluded. Existing identities/revisions are never overwritten.
-- All heads precede revisions so group membership triggers can resolve every parent.
-- Generated with scripts/catalogue/export-release-seed.py; review before release.
CREATE TABLE __catalogue_release_seed(id TEXT PRIMARY KEY,kind TEXT,version INTEGER,content TEXT);
INSERT INTO __catalogue_release_seed VALUES
('bl-brand-0299cfcba06f95cb6b30a27f','brand',2,'{"code":"kayser","logo":"/api/identity-catalogue/logos/4abe7859-adad-451c-b913-823077178679","i18n":{"en":{"name":"Maison Kayser"},"zh-Hans":{"name":"Maison Kayser"},"zh-Hant":{"name":"Maison Kayser"}}}'),
('bl-brand-23eeb69c681dfdb8eacc7ce9','brand',3,'{"code":"garden","logo":"/api/identity-catalogue/logos/3ed951bf-d9ee-4530-ba7b-d288dd160364","i18n":{"en":{"name":"Garden"},"zh-Hans":{"name":"嘉顿"},"zh-Hant":{"name":"嘉頓"}}}'),
('bl-brand-56877aab9e1365c49bc8bd85','brand',3,'{"code":"yamazaki","logo":"/api/identity-catalogue/logos/d89bbe7a-57b0-462a-8147-8e388ac43883","groupId":"bl-group-yamazaki-group","i18n":{"en":{"name":"Yamazaki"},"zh-Hans":{"name":"山崎面包"},"zh-Hant":{"name":"山崎麵包"}}}'),
('bl-brand-5fdb63561d5d9a409280a050','brand',2,'{"code":"deedee","logo":"/api/identity-catalogue/logos/7108b5d6-3975-41de-97f8-544fca8597ed","i18n":{"en":{"name":"Dee Dee Bakery"},"zh-Hans":{"name":"Dee Dee Bakery"},"zh-Hant":{"name":"Dee Dee Bakery"}}}'),
('bl-brand-6adde6a89e62eace7c1075c6','brand',2,'{"code":"nibbles","logo":"/api/identity-catalogue/logos/8dd90286-0f65-4184-bd0a-6aa12c544f9c","i18n":{"en":{"name":"Nibbles Baking Nook"},"zh-Hans":{"name":"Nibbles Baking Nook"},"zh-Hant":{"name":"Nibbles Baking Nook"}}}'),
('bl-brand-6e1c7692996206c63b88a61e','brand',3,'{"code":"fresh-wheat","logo":"/api/identity-catalogue/logos/b19145e2-b24c-4e82-957f-e18d8a49b58e","i18n":{"en":{"name":"Fresh Wheat Bakery"},"zh-Hans":{"name":"美麦多包饼屋"},"zh-Hant":{"name":"美麥多包餅屋"}}}'),
('bl-brand-7414c730dd836bb4cddefc9b','brand',4,'{"groupId":"bl-group-dfi","code":"7eleven","categories":["convenience_store"],"logo":"/api/identity-catalogue/logos/79936bc8-f6cc-4d9b-a0fd-0c9e6e8e9a66","i18n":{"en":{"name":"7-Eleven"},"zh-Hans":{"name":"7-Eleven"},"zh-Hant":{"name":"7-Eleven"}}}'),
('bl-brand-763677987520dd76a27717e9','brand',3,'{"code":"honore","logo":"/api/identity-catalogue/logos/58eff6af-885b-4678-ab68-13e52d8559b3","groupId":"bl-group-cra","i18n":{"en":{"name":"Saint Honore"},"zh-Hans":{"name":"圣安娜饼屋"},"zh-Hant":{"name":"聖安娜餅屋"}}}'),
('bl-brand-79cba6910c5a78730c2d9d0f','brand',3,'{"code":"harlans","logo":"/api/identity-catalogue/logos/dbe01eae-c111-4a4d-b46e-59f2ce14388f","groupId":"bl-group-jc","i18n":{"en":{"name":"Harlan’s"},"zh-Hans":{"name":"Harlan’s"},"zh-Hant":{"name":"Harlan’s"}}}'),
('bl-brand-85af70cde80552a2dcb84f30','brand',4,'{"code":"peninsula","logo":"/api/identity-catalogue/logos/69450f9b-800c-41a5-8983-8e4dd3644cf0","groupId":"bl-group-hsh","i18n":{"en":{"name":"The Peninsula"},"zh-Hans":{"name":"半岛酒店"},"zh-Hant":{"name":"半島酒店"}}}'),
('bl-brand-979304c697eaae04756dd221','brand',4,'{"groupId":"bl-group-maxims-group","code":"arome","logo":"/api/identity-catalogue/logos/845fa0c0-c0a9-41b9-87ca-525e1864163f","i18n":{"en":{"name":"Arome"},"zh-Hans":{"name":"阿罗梅"},"zh-Hant":{"name":"阿羅梅"}}}'),
('bl-brand-f2d1ba57ddbb39205c04bc1b','brand',3,'{"code":"childhood","logo":"/api/identity-catalogue/logos/c48121d3-1c85-4959-b9cc-853bc64faf19","i18n":{"en":{"name":"Childhood Bakery"},"zh-Hans":{"name":"小时候面包店"},"zh-Hant":{"name":"小時候麵包店"}}}'),
('bl-brand-f6c5535345028c3db0f52253','brand',3,'{"code":"wooloomooloo","logo":"/api/identity-catalogue/logos/fdb70de7-4653-43c6-be8f-ab424a5c8edf","groupId":"bl-group-wooloomooloo-group","i18n":{"en":{"name":"Wooloomooloo Prime"},"zh-Hans":{"name":"Wooloomooloo Prime"},"zh-Hant":{"name":"Wooloomooloo Prime"}}}'),
('bl-brand-f92a296e7ea8ebb1653c2f7e','brand',8,'{"groupId":"bl-group-maxims-group","code":"maxims","categories":["bakery"],"logo":"/api/identity-catalogue/logos/d4319688-0b36-477c-aa7b-f0d0f751e581","i18n":{"en":{"name":"Maxim''s"},"zh-Hans":{"name":"美心西饼"},"zh-Hant":{"name":"美心西餅"}}}'),
('bl-group-cra','group',3,'{"code":"cra","logo":"/api/identity-catalogue/logos/b1f47090-50ca-49f6-9a8c-d579d41e5ba9","i18n":{"en":{"name":"Convenience Retail Asia"},"zh-Hans":{"name":"Convenience Retail Asia"},"zh-Hant":{"name":"Convenience Retail Asia"}}}'),
('bl-group-dfi','group',3,'{"code":"dfi","logo":"/api/identity-catalogue/logos/a98f8f93-a4af-4206-b9da-a9efebd9d7ec","i18n":{"en":{"name":"DFI Retail Group"},"zh-Hans":{"name":"DFI Retail Group"},"zh-Hant":{"name":"DFI Retail Group"}}}'),
('bl-group-hsh','group',3,'{"code":"hsh","logo":"/api/identity-catalogue/logos/568adc55-f789-480f-bf16-d962fa232ab3","i18n":{"en":{"name":"The Hongkong and Shanghai Hotels, Limited"},"zh-Hans":{"name":"The Hongkong and Shanghai Hotels, Limited"},"zh-Hant":{"name":"The Hongkong and Shanghai Hotels, Limited"}}}'),
('bl-group-jc','group',3,'{"code":"jc","logo":"/api/identity-catalogue/logos/266e71cb-96a0-45b7-9479-c3640b72906e","i18n":{"en":{"name":"JC Group"},"zh-Hans":{"name":"JC Group"},"zh-Hant":{"name":"JC Group"}}}'),
('bl-group-maxims-group','group',4,'{"groupId":"bl-group-dfi","code":"maxims-group","logo":"/api/identity-catalogue/logos/bc1a9125-baf5-4c5b-ace4-7fc183eb2741","i18n":{"en":{"name":"Maxim''s Group"},"zh-Hans":{"name":"Maxim''s Group"},"zh-Hant":{"name":"Maxim''s Group"}}}'),
('bl-group-wooloomooloo-group','group',3,'{"code":"wooloomooloo-group","logo":"/api/identity-catalogue/logos/ad3ea424-f575-48ca-be5b-27e7a0547387","i18n":{"en":{"name":"Wooloomooloo Groups"},"zh-Hans":{"name":"Wooloomooloo Group"},"zh-Hant":{"name":"Wooloomooloo Group"}}}'),
('bl-group-yamazaki-group','group',3,'{"code":"yamazaki-group","logo":"/api/identity-catalogue/logos/81c3c744-191d-4d71-8d7e-46fc82322fda","i18n":{"en":{"name":"Yamazaki Baking Co., Ltd."},"zh-Hans":{"name":"Yamazaki Baking Co., Ltd."},"zh-Hant":{"name":"Yamazaki Baking Co., Ltd."}}}');
CREATE TABLE __catalogue_release_sources(source TEXT,sourceId TEXT,catalogueId TEXT);
INSERT INTO __catalogue_release_sources VALUES
('brand:breadlineBrand','7eleven','bl-brand-7414c730dd836bb4cddefc9b'),
('brand:breadlineBrand','arome','bl-brand-979304c697eaae04756dd221'),
('brand:breadlineBrand','childhood','bl-brand-f2d1ba57ddbb39205c04bc1b'),
('brand:breadlineBrand','deedee','bl-brand-5fdb63561d5d9a409280a050'),
('brand:breadlineBrand','fresh-wheat','bl-brand-6e1c7692996206c63b88a61e'),
('brand:breadlineBrand','garden','bl-brand-23eeb69c681dfdb8eacc7ce9'),
('brand:breadlineBrand','harlans','bl-brand-79cba6910c5a78730c2d9d0f'),
('brand:breadlineBrand','honore','bl-brand-763677987520dd76a27717e9'),
('brand:breadlineBrand','kayser','bl-brand-0299cfcba06f95cb6b30a27f'),
('brand:breadlineBrand','maxims','bl-brand-f92a296e7ea8ebb1653c2f7e'),
('brand:breadlineBrand','nibbles','bl-brand-6adde6a89e62eace7c1075c6'),
('brand:breadlineBrand','peninsula','bl-brand-85af70cde80552a2dcb84f30'),
('brand:breadlineBrand','wooloomooloo','bl-brand-f6c5535345028c3db0f52253'),
('brand:breadlineBrand','yamazaki','bl-brand-56877aab9e1365c49bc8bd85');
-- Snapshot the missing set before inserting anything; replay leaves existing heads untouched.
CREATE TABLE __catalogue_release_new AS SELECT s.* FROM __catalogue_release_seed s
WHERE NOT EXISTS(SELECT 1 FROM identityCatalogue c WHERE c.id=s.id);

-- Abort on identity/code/source conflicts instead of merging distinct identities.
CREATE TABLE __catalogue_release_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO __catalogue_release_guard SELECT
 NOT EXISTS(SELECT 1 FROM __catalogue_release_seed s JOIN identityCatalogue c ON c.id=s.id WHERE c.kind<>s.kind)
 AND NOT EXISTS(SELECT 1 FROM __catalogue_release_new s JOIN identityCatalogue c ON c.kind=s.kind
   JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
   WHERE json_extract(s.content,'$.code')=json_extract(r.content,'$.code'))
 AND NOT EXISTS(SELECT 1 FROM __catalogue_release_sources s JOIN __catalogue_release_new n ON n.id=s.catalogueId
   JOIN identityCatalogueSource p ON p.source=s.source AND p.sourceId=s.sourceId WHERE p.catalogueId<>s.catalogueId);

INSERT INTO identityCatalogue(id,kind,version) SELECT id,kind,version FROM __catalogue_release_new;
-- Write through the authoritative revision view to retain normalized translations and triggers.
INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt)
SELECT id,version,content,'system:migration:0247',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM __catalogue_release_new;
INSERT INTO identityCatalogueSource(source,sourceId,catalogueId)
SELECT s.source,s.sourceId,s.catalogueId FROM __catalogue_release_sources s
JOIN __catalogue_release_new n ON n.id=s.catalogueId;

DROP TABLE __catalogue_release_guard;
DROP TABLE __catalogue_release_new;
DROP TABLE __catalogue_release_sources;
DROP TABLE __catalogue_release_seed;
