-- Cover visibility/scope/flag predicates without reading the large feature payload.
CREATE INDEX feature_query_visibility_idx ON feature (
  isDraft, isPublished, isArchived, layerId, organisationId, projectId, id,
  isVisitable, isIntangible
);
CREATE INDEX feature_query_layer_idx ON feature (
  layerId, isDraft, isPublished, isArchived, id, organisationId, projectId,
  isVisitable, isIntangible
);
CREATE INDEX feature_query_id_idx ON feature (
  id, isDraft, isPublished, isArchived, layerId, organisationId, projectId,
  isVisitable, isIntangible
);
CREATE INDEX feature_property_selection_idx ON featureProperty(propertyId, propertyValueId, featureId);
CREATE INDEX feature_property_range_idx ON featureProperty(propertyId, CAST(value AS REAL), featureId);
CREATE INDEX user_feature_wishlist_idx ON userFeature(userId, isWishlisted, featureId);
CREATE INDEX user_feature_visited_idx ON userFeature(userId, isVisited, featureId);

-- One-, two- and three-character postings preserve literal substring search,
-- including short CJK queries. Full text is verified only for indexed candidates.
CREATE TABLE featureSearchGram (
  gram TEXT NOT NULL,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale TEXT NOT NULL,
  PRIMARY KEY (gram, featureId, locale)
) WITHOUT ROWID;
CREATE INDEX feature_search_gram_owner_idx ON featureSearchGram(featureId, locale);
CREATE TABLE featureNeighbourhood (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  neighbourhood TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX feature_neighbourhood_lookup_idx ON featureNeighbourhood(neighbourhood, featureId);

CREATE TRIGGER feature_search_i18n_insert AFTER INSERT ON featureI18n BEGIN
  INSERT OR IGNORE INTO featureSearchGram(gram, featureId, locale)
  SELECT substr(content, position, size), NEW.featureId, NEW.locale
  FROM (
    WITH RECURSIVE
      fields(content) AS (SELECT lower(NEW.title) UNION ALL SELECT lower(NEW.description) UNION ALL SELECT lower(NEW.displayAddress)),
      positions(position) AS (SELECT 1 UNION ALL SELECT position + 1 FROM positions WHERE position < (SELECT coalesce(max(length(content)), 0) FROM fields)),
      sizes(size) AS (VALUES(1),(2),(3))
    SELECT content, position, size FROM fields CROSS JOIN positions CROSS JOIN sizes
    WHERE position + size - 1 <= length(content)
  );
  INSERT OR REPLACE INTO featureNeighbourhood(featureId, neighbourhood)
  SELECT NEW.featureId, json_extract(NEW.addressProperties, '$.neighbourhood')
  WHERE NEW.locale = 'en' AND json_extract(NEW.addressProperties, '$.neighbourhood') IS NOT NULL
    AND json_extract(NEW.addressProperties, '$.neighbourhood') != '';
END;

CREATE TRIGGER feature_search_i18n_delete AFTER DELETE ON featureI18n BEGIN
  DELETE FROM featureSearchGram WHERE featureId = OLD.featureId AND locale = OLD.locale;
  DELETE FROM featureNeighbourhood WHERE featureId = OLD.featureId AND OLD.locale = 'en';
END;

CREATE TRIGGER feature_search_i18n_update AFTER UPDATE OF featureId, locale, title, description, displayAddress, addressProperties ON featureI18n BEGIN
  DELETE FROM featureSearchGram WHERE featureId = OLD.featureId AND locale = OLD.locale;
  INSERT OR IGNORE INTO featureSearchGram(gram, featureId, locale)
  SELECT substr(content, position, size), NEW.featureId, NEW.locale
  FROM (
    WITH RECURSIVE
      fields(content) AS (SELECT lower(NEW.title) UNION ALL SELECT lower(NEW.description) UNION ALL SELECT lower(NEW.displayAddress)),
      positions(position) AS (SELECT 1 UNION ALL SELECT position + 1 FROM positions WHERE position < (SELECT coalesce(max(length(content)), 0) FROM fields)),
      sizes(size) AS (VALUES(1),(2),(3))
    SELECT content, position, size FROM fields CROSS JOIN positions CROSS JOIN sizes
    WHERE position + size - 1 <= length(content)
  );
  DELETE FROM featureNeighbourhood WHERE featureId = OLD.featureId AND OLD.locale = 'en';
  INSERT OR REPLACE INTO featureNeighbourhood(featureId, neighbourhood)
  SELECT NEW.featureId, json_extract(NEW.addressProperties, '$.neighbourhood')
  WHERE NEW.locale = 'en' AND json_extract(NEW.addressProperties, '$.neighbourhood') IS NOT NULL
    AND json_extract(NEW.addressProperties, '$.neighbourhood') != '';
END;

-- Populate existing translations through exactly the same trigger path as future writes.
UPDATE featureI18n SET title = title
WHERE EXISTS (SELECT 1 FROM feature WHERE feature.id = featureI18n.featureId);
