-- Parent publication must not bypass a type's required Location association.
-- Existing published Features and policy changes are left untouched.
CREATE TRIGGER feature_intent_publication_guard
BEFORE UPDATE OF isPublished ON feature
WHEN NEW.isPublished=1 AND OLD.isPublished<>1 AND NEW.featureType IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=NEW.id)
  AND EXISTS(
    SELECT 1 FROM layer l
    JOIN project p ON p.id=l.projectId
    JOIN organisation o ON o.id=p.organisationId
    LEFT JOIN featureIntentPolicy pp ON pp.scopeType='project' AND pp.scopeId=p.id
    LEFT JOIN featureIntentPolicy hp ON hp.scopeType='hub'
      AND hp.scopeId=coalesce(o.hubId,(SELECT id FROM hub WHERE code='core'))
    JOIN json_each(coalesce(pp.definition,hp.definition,'[]')) definition
    WHERE l.id=NEW.layerId
      AND json_extract(definition.value,'$.id')=NEW.featureType
      AND json_extract(definition.value,'$.associationRequired')=1
  )
BEGIN
  SELECT RAISE(ABORT,'Link a Location before publishing this feature type.');
END;
