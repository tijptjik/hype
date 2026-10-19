// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'

/**
 * Project accepted brands into an already-authorized Feature read without extra queries.
 * @returns A correlated JSON-text expression: null for no accessible association, [] for clear.
 * @remarks Reads the accepted facts revision, never the latest source revision. Private
 * ownership and draft guards apply inside the projection. Use only on root Feature
 * queries: its explicit outer alias prevents Drizzle from stripping correlated qualifiers.
 * This field is read-only and is not a duplicate feature-property assignment.
 */
export function featurePlaceBrandsSQL(): SQL<string | null> {
  return sql<string | null>`(SELECT CASE json_extract(fp.overrides,'$.brands.mode')
    WHEN 'clear' THEN '[]'
    WHEN 'override' THEN json_extract(fp.overrides,'$.brands.value')
    ELSE json_extract(pr.facts,'$.brands') END
    FROM featurePlace fp JOIN place p ON p.id=fp.placeId
    JOIN placeRevision pr ON pr.id=fp.factsRevisionId AND pr.placeId=fp.placeId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (p.ownerProjectId IS NULL OR p.ownerProjectId="feature"."projectId"))`
}
