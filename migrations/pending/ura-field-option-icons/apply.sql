-- Apply in one transaction after 0275. Stable IDs retain all recorded selections.
-- NULL ranks preserve the project's ordering for categorical options.
CREATE TABLE _ura_options(propertyId TEXT NOT NULL, id TEXT PRIMARY KEY, icon TEXT NOT NULL, rank INTEGER, english TEXT);
INSERT INTO _ura_options VALUES
  ('ceab3f49092c', '866935a61761', 'completeness-trace', 0, NULL),
  ('ceab3f49092c', '897695578c94', 'completeness-partial', 1, NULL),
  ('ceab3f49092c', '9739bb0464c4', 'completeness-complete', 2, NULL),
  ('c0ab375a69d4', '7f33a3485dc9', 'condition-deteriorated', 0, 'Heavily Deteriorated'),
  ('c0ab375a69d4', 'd5f85da93d43', 'condition-weathered', 1, 'Weathered'),
  ('c0ab375a69d4', '0935e5ca1c9d', 'condition-preserved', 2, 'Well Preserved'),
  ('83f2d71bff2f', 'dab71f7ccfa6', 'priority-low', 0, NULL),
  ('83f2d71bff2f', '62e447f3ff2b', 'priority-medium', 1, NULL),
  ('83f2d71bff2f', '12408fc2c4f0', 'priority-high', 2, NULL),
  ('b6fc3ea8637f', '8650c0959e23', 'recovery-low', 0, NULL),
  ('b6fc3ea8637f', 'e933d9eedd56', 'recovery-medium', 1, NULL),
  ('b6fc3ea8637f', '899e46318f72', 'recovery-high', 2, NULL),
  ('e404c2f7255c', 'a3427b436f0d', 'size-small', 0, NULL),
  ('e404c2f7255c', 'ee6b6702877e', 'size-medium', 1, NULL),
  ('e404c2f7255c', '592092bc86cf', 'size-large', 2, NULL),
  ('3453e093ef20', 'cfaeb668d235', 'site-east', NULL, NULL),
  ('3453e093ef20', 'c02ba0cd732d', 'site-main', NULL, NULL),
  ('3453e093ef20', '0bf271e73db7', 'site-north', NULL, NULL),
  ('9dd0292756ac', 'cde28fe94670', 'strata-exposed', NULL, NULL),
  ('9dd0292756ac', '8522feebc475', 'strata-overpainted', NULL, NULL),
  ('9dd0292756ac', '3153fcdc2ac2', 'strata-overlaid', NULL, NULL),
  ('9dd0292756ac', '494257711a40', 'strata-revealed', NULL, NULL),
  ('7b442d8c3626', 'cd1aa3b9c747', 'material-paint', NULL, NULL),
  ('7b442d8c3626', '470d7a9cab60', 'material-metal', NULL, NULL),
  ('7b442d8c3626', '4c2d85e3abf6', 'material-wood', NULL, NULL),
  ('7b442d8c3626', '7f4ad150fa36', 'material-acrylic', NULL, NULL),
  ('7b442d8c3626', '252cd278f26b', 'material-stone', NULL, NULL),
  ('7b442d8c3626', '4530253485ce', 'material-concrete', NULL, NULL),
  ('7b442d8c3626', '33af73849ca2', 'material-terrazzo', NULL, NULL),
  ('7b442d8c3626', '9bb654d728c3', 'material-mixed', NULL, NULL),
  ('7aa013d38325', 'aed0fd6fec3f', 'substrate-concrete', NULL, NULL),
  ('7aa013d38325', '700798e39e6d', 'substrate-brick', NULL, NULL),
  ('7aa013d38325', '74c82a3f36dc', 'substrate-wood', NULL, NULL),
  ('7aa013d38325', 'd578cbf8b266', 'substrate-metal', NULL, NULL),
  ('7aa013d38325', 'c16842848066', 'substrate-tile', NULL, NULL),
  ('7aa013d38325', '5e7e866665e5', 'substrate-stone', NULL, NULL),
  ('7aa013d38325', '16a1d5b8b4bf', 'substrate-other', NULL, NULL),
  ('13c9160d86eb', 'd1f2c9888320', 'technique-painted', NULL, NULL),
  ('13c9160d86eb', '81d0b2dd39fd', 'technique-stencilled', NULL, NULL),
  ('13c9160d86eb', '2b9bcfc98535', 'technique-printed', NULL, NULL),
  ('13c9160d86eb', 'bfa70957c917', 'technique-engraved', NULL, NULL),
  ('13c9160d86eb', 'a4cee12f10ea', 'technique-carved', NULL, NULL),
  ('13c9160d86eb', '93d9a8ed4d8b', 'technique-cast', NULL, NULL),
  ('13c9160d86eb', 'b976f8c91d42', 'technique-mounted', NULL, NULL);
CREATE TABLE _ura_guard(ok INTEGER NOT NULL CHECK(ok=1));
-- Validate identities, scope and authored condition translations before changing the catalogue.
INSERT INTO _ura_guard SELECT count(*)=(SELECT count(*) FROM _ura_options)
FROM _ura_options o JOIN propertyValue v ON v.id=o.id AND v.propertyId=o.propertyId
JOIN property p ON p.id=v.propertyId AND p.scope='project' AND p.projectId='uciucvc_Lhj0'
LEFT JOIN propertyValueI18n i ON i.propertyValueId=v.id AND i.locale='en'
WHERE o.english IS NULL OR (i.value IS NOT NULL AND i.valueGen=0 AND i.isAutomaticOnly=0);
CREATE VIEW _ura_art_snapshot AS SELECT (SELECT json_group_object(id,json(content)) FROM (
 SELECT property.id AS id,json_object('record',json(json_object('organisationId',"property"."organisationId",'hubId',"property"."hubId",'projectId',"property"."projectId",'scope',"property"."scope",'type',"property"."type",'key',"property"."key",'dataType',"property"."dataType",'dateResolution',"property"."dateResolution",'timeMaxHour',"property"."timeMaxHour",'cardinality',"property"."cardinality",'presentation',"property"."presentation",'audience',"property"."audience",'component',"property"."component",'min',"property"."min",'max',"property"."max",'isTranslatable',json(CASE WHEN "property"."isTranslatable" IS NULL THEN 'null' WHEN "property"."isTranslatable" THEN 'true' ELSE 'false' END),'isUserContributable',json(CASE WHEN "property"."isUserContributable" IS NULL THEN 'null' WHEN "property"."isUserContributable" THEN 'true' ELSE 'false' END),'isDefaultEnabled',json(CASE WHEN "property"."isDefaultEnabled" IS NULL THEN 'null' WHEN "property"."isDefaultEnabled" THEN 'true' ELSE 'false' END))),
 'i18n',json((SELECT json_group_object(locale,json(content)) FROM (SELECT propertyI18n.locale AS locale,json_patch(json_object('label',"propertyI18n"."label",'labelGen',json(CASE WHEN "propertyI18n"."labelGen" IS NULL THEN 'null' WHEN "propertyI18n"."labelGen" THEN 'true' ELSE 'false' END),'placeholder',"propertyI18n"."placeholder",'placeholderGen',json(CASE WHEN "propertyI18n"."placeholderGen" IS NULL THEN 'null' WHEN "propertyI18n"."placeholderGen" THEN 'true' ELSE 'false' END)),CASE WHEN "propertyI18n"."translationProvenance" IS NULL THEN '{}' ELSE json_object('translationProvenance',json("propertyI18n"."translationProvenance")) END) AS content FROM propertyI18n WHERE propertyI18n.propertyId=property.id AND COALESCE(propertyI18n.isAutomaticOnly,0)=0 ORDER BY propertyI18n.locale))),
 'values',json((SELECT json_group_object(id,json(content)) FROM (SELECT propertyValue.id AS id,json_object('record',json(CASE WHEN propertyValue.icon IS NULL THEN json_object('rank',"propertyValue"."rank",'value',"propertyValue"."value") ELSE json_set(json_object('rank',"propertyValue"."rank",'value',"propertyValue"."value"),'$.icon',propertyValue.icon) END),'i18n',json((SELECT json_group_object(locale,json(content)) FROM (SELECT propertyValueI18n.locale AS locale,json_patch(json_object('value',"propertyValueI18n"."value",'valueGen',json(CASE WHEN "propertyValueI18n"."valueGen" IS NULL THEN 'null' WHEN "propertyValueI18n"."valueGen" THEN 'true' ELSE 'false' END)),CASE WHEN "propertyValueI18n"."translationProvenance" IS NULL THEN '{}' ELSE json_object('translationProvenance',json("propertyValueI18n"."translationProvenance")) END) AS content FROM propertyValueI18n WHERE propertyValueI18n.propertyValueId=propertyValue.id AND COALESCE(propertyValueI18n.isAutomaticOnly,0)=0 ORDER BY propertyValueI18n.locale)))) AS content FROM propertyValue WHERE propertyValue.propertyId=property.id ORDER BY propertyValue.id)))
 ) AS content FROM property WHERE scope='project' AND projectId='uciucvc_Lhj0' ORDER BY property.id)) AS content;
CREATE TABLE _ura_art_pending AS
SELECT v.id FROM propertyValue v JOIN _ura_options o ON o.id=v.id
LEFT JOIN propertyValueI18n i ON i.propertyValueId=v.id AND i.locale='en'
WHERE v.icon IS NOT o.icon OR (o.rank IS NOT NULL AND v.rank<>o.rank)
   OR (o.english IS NOT NULL AND i.value IS NOT o.english);
-- Fail closed if the live catalogue differs from its authoritative history head.
INSERT INTO _ura_guard SELECT NOT EXISTS(SELECT 1 FROM propertyCatalogRevisionHead h JOIN propertyCatalogRevision r ON r.id=h.currentRevisionId WHERE h.scope='project' AND h.resourceId='uciucvc_Lhj0' AND r.content<>(SELECT content FROM _ura_art_snapshot));
INSERT INTO propertyCatalogRevisionWrite(scope,resourceId,token) SELECT 'project','uciucvc_Lhj0','ura-option-art-v1' WHERE EXISTS(SELECT 1 FROM _ura_art_pending);
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt) SELECT 'ura-option-art-v1-baseline','system:migration:ura-option-art-v1','migration','Catalogue before survey option artwork and ordering',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS(SELECT 1 FROM _ura_art_pending) AND NOT EXISTS(SELECT 1 FROM propertyCatalogRevisionHead WHERE scope='project' AND resourceId='uciucvc_Lhj0');
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content) SELECT 'ura-option-art-v1-baseline','project','uciucvc_Lhj0',NULL,'ura-option-art-v1-baseline',(SELECT content FROM _ura_art_snapshot) WHERE EXISTS(SELECT 1 FROM _ura_art_pending) AND NOT EXISTS(SELECT 1 FROM propertyCatalogRevisionHead WHERE scope='project' AND resourceId='uciucvc_Lhj0');
INSERT INTO propertyCatalogRevisionHead(scope,resourceId,currentRevisionId,generation) SELECT 'project','uciucvc_Lhj0','ura-option-art-v1-baseline',0 WHERE EXISTS(SELECT 1 FROM _ura_art_pending) AND NOT EXISTS(SELECT 1 FROM propertyCatalogRevisionHead WHERE scope='project' AND resourceId='uciucvc_Lhj0');
UPDATE propertyValue SET icon=o.icon, rank=coalesce(o.rank,propertyValue.rank)
FROM _ura_options o WHERE propertyValue.id=o.id AND propertyValue.id IN (SELECT id FROM _ura_art_pending);
UPDATE propertyValueI18n SET value=o.english FROM _ura_options o
WHERE propertyValueI18n.propertyValueId=o.id AND locale='en' AND o.english IS NOT NULL AND value<>o.english;
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt) SELECT 'ura-option-art-v1','system:migration:ura-option-art-v1','migration','Add survey option artwork, scalar ordering and condition labels',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS(SELECT 1 FROM _ura_art_pending);
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content) SELECT 'ura-option-art-v1','project',h.resourceId,h.currentRevisionId,'ura-option-art-v1',(SELECT content FROM _ura_art_snapshot) FROM propertyCatalogRevisionHead h WHERE h.scope='project' AND h.resourceId='uciucvc_Lhj0' AND EXISTS(SELECT 1 FROM _ura_art_pending);
UPDATE propertyCatalogRevisionHead SET currentRevisionId='ura-option-art-v1',generation=generation+1 WHERE scope='project' AND resourceId='uciucvc_Lhj0' AND EXISTS(SELECT 1 FROM _ura_art_pending);
DELETE FROM propertyCatalogRevisionWrite WHERE scope='project' AND resourceId='uciucvc_Lhj0' AND token='ura-option-art-v1';
DROP TABLE _ura_art_pending;
DROP VIEW _ura_art_snapshot;
DROP TABLE _ura_guard;
DROP TABLE _ura_options;
