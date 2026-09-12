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

-- English neighbourhood identity supports filters without reading translation payloads.
CREATE TABLE featureNeighbourhood (
  featureId TEXT PRIMARY KEY NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  neighbourhood TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX feature_neighbourhood_lookup_idx ON featureNeighbourhood(neighbourhood, featureId);
