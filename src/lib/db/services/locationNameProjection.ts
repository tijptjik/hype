import { acceptedLocationOverrideFieldSql } from './locationFactsSql'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SNAPSHOT CONTRACT
import {
  acceptedLocationFactsFieldSql,
  locationFactsFieldSql,
} from './locationFactsSql'
// TYPES
import type { SQL } from 'drizzle-orm'

/** Project the accepted venue names independently of a Feature's own title.
 * @param includeShared False only for pre-migration retained fixtures.
 * @returns Localized names as JSON text, or null when no readable association exists.
 * @remarks Use only on authorized root Feature reads. Accepted Organisation corrections
 * apply per locale; clears remove that locale. Latest revisions and independent Feature
 * titles never replace the accepted venue. Draft and private-owner guards match brands.
 */
export function featureLocationNamesSQL(includeShared = true): SQL<string | null> {
  // Merge only explicit corrections; JSON merge-patch removes cleared locale keys.
  return sql<string | null>`(SELECT json_patch(
    COALESCE(${includeShared ? acceptedLocationFactsFieldSql('names') : locationFactsFieldSql(sql.raw('pr.facts'), 'names')}, '{}'),
    (SELECT json_group_object(name.key, CASE json_extract(name.value,'$.mode')
      WHEN 'override' THEN json_extract(name.value,'$.value') ELSE NULL END)
      FROM json_each(${acceptedLocationOverrideFieldSql('names', includeShared)}) name
      WHERE json_extract(name.value,'$.mode') IN ('override','clear')))
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevisionContent pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (json_type(pr.facts,'$.schemaVersion') IS NULL OR json_extract(pr.facts,'$.schemaVersion')=1)
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId")))`
}
