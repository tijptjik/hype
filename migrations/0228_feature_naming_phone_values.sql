-- Refs #241; spec/breadline/proposal/01-places-features.md.
-- Phone fields use the same saved-value presence conditions as short text.
DROP VIEW featureComputedName;
CREATE VIEW featureComputedName AS
SELECT i.featureId,i.locale,
  CASE WHEN f.nameTemplate IS NULL THEN COALESCE(i.baseName,i.title,'')
    WHEN i.nameOverride IS NOT NULL THEN i.nameOverride
    ELSE (WITH RECURSIVE
      parts AS (
        SELECT CAST(c.key AS INTEGER) n,
          CASE WHEN json_extract(c.value,'$.test')='hasValue' THEN CASE
            WHEN p.dataType='text' AND p.component IN ('InputField','TextField','PhoneField')
              AND length(trim(COALESCE((SELECT t.value FROM featurePropertyI18n t WHERE t.featureId=f.id AND t.propertyId=p.id AND lower(replace(t.locale,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1),v.value,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)))>0
            THEN COALESCE((SELECT t.value FROM featurePropertyI18n t WHERE t.featureId=f.id AND t.propertyId=p.id AND lower(replace(t.locale,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1),v.value,'')
            ELSE trim(COALESCE(json_extract(l.value,'$.false'),''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) END
          ELSE trim(COALESCE(json_extract(l.value,CASE
            WHEN (p.dataType='boolean' OR p.component='ToggleField') AND v.value IN ('true','1') THEN '$.true'
            WHEN (p.dataType='boolean' OR p.component='ToggleField') AND v.value IN ('false','0') THEN '$.false'
            ELSE '$.null' END),''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) END part,
          json_extract(l.value,'$.placement') placement,
          COALESCE(json_extract(l.value,'$.separator'),'') separator
        FROM json_each(json_extract(f.nameTemplate,'$.rule.conditions')) c
        LEFT JOIN json_each(json_extract(c.value,'$.locales')) l
          ON l.key=(SELECT key FROM json_each(json_extract(c.value,'$.locales'))
            WHERE lower(replace(key,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1)
        LEFT JOIN property p ON p.id=json_extract(c.value,'$.propertyId')
        LEFT JOIN featureProperty v ON v.featureId=f.id AND v.propertyId=p.id
      ),
      fold(n,name,resolved) AS (
        SELECT 0,CASE json_extract(f.nameTemplate,'$.rule.base') WHEN 'location' THEN
          COALESCE((SELECT value FROM json_each((SELECT names FROM featureAcceptedNamingLocation WHERE featureId=f.id))
            WHERE lower(replace(key,'-',''))=lower(replace(i.locale,'-','')) LIMIT 1),'')
          ELSE COALESCE(i.baseName,i.title,'') END,1
        UNION ALL
        SELECT fold.n+1,CASE WHEN name='' OR resolved=0 THEN '' WHEN part='' THEN name
          WHEN placement='prefix' THEN part||separator||name ELSE name||separator||part END,
          CASE WHEN name='' THEN 0 ELSE resolved END
        FROM fold JOIN parts ON parts.n=fold.n
      ) SELECT name FROM fold ORDER BY n DESC LIMIT 1)
  END title
FROM featureI18n i JOIN feature f ON f.id=i.featureId;

-- Refresh derived titles without changing authored inputs or immutable revision history.
UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n
  WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
WHERE featureId IN (SELECT id FROM feature WHERE nameTemplate IS NOT NULL);
