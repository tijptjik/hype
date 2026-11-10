-- Refs #241; spec/breadline/proposal/01-places-features.md.
-- Use the phone editor for the established core WhatsApp property without changing
-- its identity, assignments or stored values. PhoneField accepts legacy scalar text.
CREATE TABLE __core_whatsapp_phone_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO __core_whatsapp_phone_guard
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM property p WHERE p.id = 'gPropWaNum01' AND (
    p.key <> 'whatsappNumber' OR p.scope <> 'hub' OR p.type <> 'specifier'
    OR p.hubId IS NOT (SELECT id FROM hub WHERE code = 'core')
    OR p.component NOT IN ('InputField', 'TextField', 'PhoneField')
    OR p.dataType <> 'text'
  )
) THEN 1 ELSE 0 END;
DROP TABLE __core_whatsapp_phone_guard;

-- Capture the complete catalogue in the same shape and order as propertyCatalogSnapshot.
CREATE VIEW __core_whatsapp_snapshot AS SELECT (SELECT json_group_object(id,json(content)) FROM (
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
CREATE TABLE __core_whatsapp_change AS
SELECT p.hubId AS resourceId FROM property p
WHERE p.id='gPropWaNum01' AND (p.component<>'PhoneField' OR p.isTranslatable<>0);
CREATE TABLE __core_whatsapp_history_guard (ok INTEGER CHECK(ok=1));
INSERT INTO __core_whatsapp_history_guard
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h JOIN propertyCatalogRevision r ON r.id=h.currentRevisionId
  WHERE h.scope='hub' AND h.resourceId IN (SELECT resourceId FROM __core_whatsapp_change)
    AND r.content<>(SELECT content FROM __core_whatsapp_snapshot)
) THEN 1 ELSE 0 END;
DROP TABLE __core_whatsapp_history_guard;

INSERT INTO propertyCatalogRevisionWrite(scope,resourceId,token)
SELECT 'hub',resourceId,'migration:0227' FROM __core_whatsapp_change;
-- Enroll an untouched catalogue with a before-image; retain an existing history head.
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT '0227-whatsapp-baseline','system:migration:0227','migration','Core catalogue before phone editor migration',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM __core_whatsapp_change c WHERE NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId));
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content)
SELECT '0227-whatsapp-baseline','hub',resourceId,NULL,'0227-whatsapp-baseline',(SELECT content FROM __core_whatsapp_snapshot)
FROM __core_whatsapp_change c WHERE NOT EXISTS (
  SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId);
INSERT INTO propertyCatalogRevisionHead(scope,resourceId,currentRevisionId,generation)
SELECT 'hub',resourceId,'0227-whatsapp-baseline',0 FROM __core_whatsapp_change c
WHERE NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId=c.resourceId);

UPDATE property
SET component = 'PhoneField', isTranslatable = 0,
    modifiedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'gPropWaNum01' AND key = 'whatsappNumber'
  AND scope = 'hub' AND hubId = (SELECT id FROM hub WHERE code = 'core')
  AND (component <> 'PhoneField' OR isTranslatable <> 0);

-- Append migration evidence and advance the head before releasing the scoped write marker.
INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT '0227-whatsapp-phone','system:migration:0227','migration','Use PhoneField for core whatsappNumber',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM __core_whatsapp_change);
INSERT INTO propertyCatalogRevision(id,scope,resourceId,previousRevisionId,changeSetId,content)
SELECT '0227-whatsapp-phone','hub',h.resourceId,h.currentRevisionId,'0227-whatsapp-phone',(SELECT content FROM __core_whatsapp_snapshot)
FROM propertyCatalogRevisionHead h WHERE h.scope='hub' AND h.resourceId IN (SELECT resourceId FROM __core_whatsapp_change);
UPDATE propertyCatalogRevisionHead SET currentRevisionId='0227-whatsapp-phone',generation=generation+1
WHERE scope='hub' AND resourceId IN (SELECT resourceId FROM __core_whatsapp_change);
DELETE FROM propertyCatalogRevisionWrite WHERE token='migration:0227' AND scope='hub'
  AND resourceId IN (SELECT resourceId FROM __core_whatsapp_change);
DROP TABLE __core_whatsapp_change;
DROP VIEW __core_whatsapp_snapshot;
