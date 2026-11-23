-- Multi-select classifiers use versioned valueJson while existing singleton IDs remain valid.
-- The application exposes this as SelectField cardinality=many; no existing field is widened here.
CREATE TRIGGER feature_property_multi_select_insert BEFORE INSERT ON featureProperty
WHEN NEW.valueJson IS NOT NULL AND EXISTS(SELECT 1 FROM property WHERE id=NEW.propertyId AND component='SelectField')
BEGIN
  SELECT CASE WHEN NOT json_valid(NEW.valueJson) THEN RAISE(ABORT,'Invalid classifier JSON') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM property WHERE id=NEW.propertyId AND type='classifier' AND component='SelectField' AND cardinality='many' AND dataType='text')
    OR NEW.propertyValueId IS NOT NULL OR NEW.value IS NOT NULL
    OR json_extract(NEW.valueJson,'$.version') IS NOT 1
    OR json_type(NEW.valueJson,'$.propertyValueIds') IS NOT 'array'
    OR json_array_length(NEW.valueJson,'$.propertyValueIds') NOT BETWEEN 1 AND 100
    OR (SELECT count(*) FROM json_each(NEW.valueJson))<>2
    OR EXISTS(SELECT 1 FROM json_each(NEW.valueJson,'$.propertyValueIds') choice WHERE choice.type<>'text' OR NOT EXISTS(SELECT 1 FROM propertyValue WHERE id=choice.value AND propertyId=NEW.propertyId))
    OR (SELECT count(*) FROM json_each(NEW.valueJson,'$.propertyValueIds'))<>(SELECT count(DISTINCT value) FROM json_each(NEW.valueJson,'$.propertyValueIds'))
    THEN RAISE(ABORT,'Invalid multi-select classifier choices') END;
END;
--> statement-breakpoint
CREATE TRIGGER feature_property_multi_select_update BEFORE UPDATE ON featureProperty
WHEN NEW.valueJson IS NOT NULL AND EXISTS(SELECT 1 FROM property WHERE id=NEW.propertyId AND component='SelectField')
BEGIN
  SELECT CASE WHEN NOT json_valid(NEW.valueJson) THEN RAISE(ABORT,'Invalid classifier JSON') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM property WHERE id=NEW.propertyId AND type='classifier' AND component='SelectField' AND cardinality='many' AND dataType='text')
    OR NEW.propertyValueId IS NOT NULL OR NEW.value IS NOT NULL
    OR json_extract(NEW.valueJson,'$.version') IS NOT 1
    OR json_type(NEW.valueJson,'$.propertyValueIds') IS NOT 'array'
    OR json_array_length(NEW.valueJson,'$.propertyValueIds') NOT BETWEEN 1 AND 100
    OR (SELECT count(*) FROM json_each(NEW.valueJson))<>2
    OR EXISTS(SELECT 1 FROM json_each(NEW.valueJson,'$.propertyValueIds') choice WHERE choice.type<>'text' OR NOT EXISTS(SELECT 1 FROM propertyValue WHERE id=choice.value AND propertyId=NEW.propertyId))
    OR (SELECT count(*) FROM json_each(NEW.valueJson,'$.propertyValueIds'))<>(SELECT count(DISTINCT value) FROM json_each(NEW.valueJson,'$.propertyValueIds'))
    THEN RAISE(ABORT,'Invalid multi-select classifier choices') END;
END;
--> statement-breakpoint
-- A populated collection cannot be narrowed or reinterpreted by a direct catalogue write.
CREATE TRIGGER property_multi_select_contract BEFORE UPDATE OF type,component,cardinality,dataType ON property
WHEN EXISTS(SELECT 1 FROM featureProperty WHERE propertyId=OLD.id AND valueJson IS NOT NULL)
 AND OLD.component='SelectField'
 AND (NEW.type<>'classifier' OR NEW.component<>'SelectField' OR NEW.cardinality<>'many' OR NEW.dataType<>'text')
BEGIN SELECT RAISE(ABORT,'Multi-select values must be migrated before changing the contract'); END;
--> statement-breakpoint
-- Match singleton FK deletion semantics without dropping the other selected options.
-- The catalogue service captures affected Feature revisions before this cascade.
CREATE TRIGGER property_value_multi_select_delete BEFORE DELETE ON propertyValue
WHEN EXISTS(SELECT 1 FROM property WHERE id=OLD.propertyId)
BEGIN
  UPDATE featureProperty SET valueJson=(
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE json_object('version',1,'propertyValueIds',json_group_array(value)) END
    FROM (SELECT value FROM json_each(featureProperty.valueJson,'$.propertyValueIds') WHERE value<>OLD.id ORDER BY value)
  ) WHERE propertyId=OLD.propertyId AND valueJson IS NOT NULL
    AND EXISTS(SELECT 1 FROM json_each(featureProperty.valueJson,'$.propertyValueIds') WHERE value=OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER property_value_multi_select_identity BEFORE UPDATE OF id,propertyId ON propertyValue
WHEN (NEW.id<>OLD.id OR NEW.propertyId<>OLD.propertyId) AND EXISTS(
  SELECT 1 FROM featureProperty,json_each(featureProperty.valueJson,'$.propertyValueIds') choice
  WHERE featureProperty.propertyId=OLD.propertyId AND featureProperty.valueJson IS NOT NULL AND choice.value=OLD.id)
BEGIN SELECT RAISE(ABORT,'Selected option identity cannot change'); END;
--> statement-breakpoint
-- Filtered counts must invalidate when a collection changes without a scalar change.
CREATE TRIGGER feature_count_revision_multi_select_update AFTER UPDATE OF valueJson ON featureProperty
WHEN OLD.valueJson IS NOT NEW.valueJson AND EXISTS(SELECT 1 FROM property WHERE id=NEW.propertyId AND component='SelectField')
BEGIN UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
