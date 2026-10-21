// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'

/**
 * Project accepted brands into an already-authorized Feature read without extra queries.
 * @returns A correlated JSON-text expression: null for no accessible brand projection, [] for clear.
 * @remarks Reads the accepted facts revision, never the latest source revision. Private
 * ownership and draft guards apply inside the projection. Use only on root Feature
 * queries: its explicit outer alias prevents Drizzle from stripping correlated qualifiers.
 * This field is read-only and is not a duplicate feature-property assignment.
 */
export function featureLocationBrandsSQL(): SQL<string | null> {
  return sql<
    string | null
  >`COALESCE((SELECT CASE json_extract(fp.overrides,'$.brands.mode')
    WHEN 'clear' THEN '[]'
    WHEN 'override' THEN json_extract(fp.overrides,'$.brands.value')
    ELSE json_extract(pr.facts,'$.brands') END
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevision pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))),
    (CASE WHEN "feature"."isDraft"=0 AND NOT EXISTS
        (SELECT 1 FROM featureLocation fp WHERE fp.featureId="feature"."id")
      THEN json_extract("feature"."localLocationBrands",'$.brands') END))`
}
