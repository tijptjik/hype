-- Refs #178; spec/breadline/proposal/01-places-features.md.
-- SaanSeoi canonical Places expose brandName but no branch designation.
-- Core hub properties are globally available; preserve subsequent catalogue edits.
CREATE TABLE __branch_identity_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO __branch_identity_guard SELECT
  (SELECT count(*) FROM hub WHERE code='core')=1
  AND NOT EXISTS(SELECT 1 FROM property WHERE id='gPropBranch1' AND
    (key<>'branch' OR scope<>'hub' OR hubId IS NOT (SELECT id FROM hub WHERE code='core') OR dataType<>'text'))
  AND NOT EXISTS(SELECT 1 FROM property WHERE key='branch' AND scope='hub'
    AND hubId=(SELECT id FROM hub WHERE code='core') AND id<>'gPropBranch1');
DROP TABLE __branch_identity_guard;

-- Capture the complete catalogue in the same shape and order as propertyCatalogSnapshot.
CREATE VIEW __core_branch_snapshot AS SELECT (SELECT json_group_object(id,json(content)) FROM (
    SELECT "property"."id" AS id,json_object(
      'record',json(json_object('organisationId',"property"."organisationId",'hubId',"property"."hubId",'projectId',"property"."projectId",'scope',"property"."scope",'type',"property"."type",'key',"property"."key",'dataType',"property"."dataType",'dateResolution',"property"."dateResolution",'timeMaxHour',"property"."timeMaxHour",'cardinality',"property"."cardinality",'presentation',"property"."presentation",'audience',"property"."audience",'component',"property"."component",'min',"property"."min",'max',"property"."max",'isTranslatable',json(CASE WHEN "property"."isTranslatable" IS NULL THEN 'null' WHEN "property"."isTranslatable" THEN 'true' ELSE 'false' END),'isUserContributable',json(CASE WHEN "property"."isUserContributable" IS NULL THEN 'null' WHEN "property"."isUserContributable" THEN 'true' ELSE 'false' END),'isDefaultEnabled',json(CASE WHEN "property"."isDefaultEnabled" IS NULL THEN 'null' WHEN "property"."isDefaultEnabled" THEN 'true' ELSE 'false' END))),
      'i18n',json((SELECT json_group_object(locale,json(content)) FROM (
        SELECT "propertyI18n"."locale" AS locale,json_object('label',"propertyI18n"."label",'labelGen',json(CASE WHEN "propertyI18n"."labelGen" IS NULL THEN 'null' WHEN "propertyI18n"."labelGen" THEN 'true' ELSE 'false' END),'placeholder',"propertyI18n"."placeholder",'placeholderGen',json(CASE WHEN "propertyI18n"."placeholderGen" IS NULL THEN 'null' WHEN "propertyI18n"."placeholderGen" THEN 'true' ELSE 'false' END)) AS content FROM "propertyI18n"
        WHERE "propertyI18n"."propertyId"="property"."id" ORDER BY "propertyI18n"."locale"))),
      'values',json((SELECT json_group_object(id,json(content)) FROM (
        SELECT "propertyValue"."id" AS id,json_object('record',json(json_object('rank',"propertyValue"."rank",'value',"propertyValue"."value")),'i18n',
          json((SELECT json_group_object(locale,json(content)) FROM (
            SELECT "propertyValueI18n"."locale" AS locale,json_object('value',"propertyValueI18n"."value",'valueGen',json(CASE WHEN "propertyValueI18n"."valueGen" IS NULL THEN 'null' WHEN "propertyValueI18n"."valueGen" THEN 'true' ELSE 'false' END)) AS content FROM "propertyValueI18n"
            WHERE "propertyValueI18n"."propertyValueId"="propertyValue"."id" ORDER BY "propertyValueI18n"."locale")))) AS content
        FROM "propertyValue" WHERE "propertyValue"."propertyId"="property"."id" ORDER BY "propertyValue"."id")))
    ) AS content FROM "property"
    WHERE "property"."scope"='hub' AND "property"."hubId"=(SELECT id FROM hub WHERE code='core') ORDER BY "property"."id")) AS content;
CREATE TABLE __core_branch_change AS
SELECT id AS resourceId FROM hub WHERE code='core'
AND NOT EXISTS (SELECT 1 FROM property WHERE id='gPropBranch1');
CREATE TABLE __core_branch_history_guard (ok INTEGER CHECK(ok=1));
INSERT INTO __core_branch_history_guard
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h JOIN propertyCatalogRevision r ON r.id=h.currentRevisionId
  WHERE h.scope='hub' AND h.resourceId IN (SELECT resourceId FROM __core_branch_change)
    AND r.content<>(SELECT content FROM __core_branch_snapshot)
) THEN 1 ELSE 0 END;
DROP TABLE __core_branch_history_guard;

INSERT INTO propertyCatalogRevisionWrite(scope,resourceId,token)
SELECT 'hub',resourceId,'migration:0231' FROM __core_branch_change;
-- Enroll an untouched catalogue with a before-image; retain an existing history head.
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT '0231-branch-baseline','system:migration:0231','migration','Core catalogue before branch property migration',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM __core_branch_change c WHERE NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId));
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content)
SELECT '0231-branch-baseline','hub',resourceId,NULL,'0231-branch-baseline',(SELECT content FROM __core_branch_snapshot)
FROM __core_branch_change c WHERE NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId);
INSERT INTO propertyCatalogRevisionHead(scope,resourceId,currentRevisionId,generation)
SELECT 'hub',resourceId,'0231-branch-baseline',0 FROM __core_branch_change c
WHERE NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId);

INSERT INTO property(id,hubId,scope,type,key,component,dataType,isTranslatable,isUserContributable,isDefaultEnabled,cardinality,presentation,audience)
SELECT 'gPropBranch1',resourceId,'hub','specifier','branch','InputField','text',1,1,0,'one','text','public'
FROM __core_branch_change;
INSERT INTO propertyI18n(propertyId,locale,label,labelGen,placeholder,placeholderGen)
SELECT 'gPropBranch1','en','Branch',0,'Branch designation',0 FROM __core_branch_change;
INSERT INTO propertyI18n(propertyId,locale,label,labelGen,placeholder,placeholderGen)
SELECT 'gPropBranch1','zh-Hant','分店',0,'分店名稱',0 FROM __core_branch_change;
INSERT INTO propertyI18n(propertyId,locale,label,labelGen,placeholder,placeholderGen)
SELECT 'gPropBranch1','zh-Hans','分店',0,'分店名称',0 FROM __core_branch_change;

-- Append migration evidence and advance the head before releasing the scoped write marker.
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT '0231-branch-text','system:migration:0231','migration','Add global free-text branch property',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM __core_branch_change);
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content)
SELECT '0231-branch-text','hub',h.resourceId,h.currentRevisionId,'0231-branch-text',(SELECT content FROM __core_branch_snapshot)
FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId IN (SELECT resourceId FROM __core_branch_change);
UPDATE propertyCatalogRevisionHead SET currentRevisionId='0231-branch-text',generation=generation+1
WHERE scope='hub' AND resourceId IN (SELECT resourceId FROM __core_branch_change);
DELETE FROM propertyCatalogRevisionWrite WHERE token='migration:0231' AND scope='hub'
  AND resourceId IN (SELECT resourceId FROM __core_branch_change);
DROP TABLE __core_branch_change;
DROP VIEW __core_branch_snapshot;
