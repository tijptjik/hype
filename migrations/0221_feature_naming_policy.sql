-- Refs #241. Naming overrides inherit independently from the feature-type catalogue.
ALTER TABLE featureIntentPolicy ADD COLUMN namingRules TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(namingRules) AND json_type(namingRules)='object');
ALTER TABLE featureIntentPolicyRevision ADD COLUMN namingRules TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(namingRules) AND json_type(namingRules)='object');

-- Move current embedded rules; retain immutable policy evidence as originally authored.
UPDATE featureIntentPolicy SET namingRules=COALESCE((
  SELECT json_group_object(json_extract(t.value,'$.id'),json(json_extract(t.value,'$.nameRule')))
  FROM json_each(definition) t WHERE t.type='object' AND json_type(t.value,'$.nameRule')='object'
),'{}') WHERE definition IS NOT NULL;
UPDATE featureIntentPolicy SET definition=(
  SELECT json_group_array(CASE WHEN t.type='object' THEN json_remove(t.value,'$.nameRule') ELSE t.value END)
  FROM json_each(definition) t
) WHERE definition IS NOT NULL;
