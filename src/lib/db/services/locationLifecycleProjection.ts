// SNAPSHOT CONTRACT
import { locationFactsFieldSql } from './locationFactsSql'
// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'

/** Project accepted operating/building status into an already-authorized Feature read.
 * @returns JSON status only; absence remains unknown.
 * @remarks Uses accepted immutable revisions/corrections, with the same private-owner/draft fence
 * as accepted brands. An edit to a Location never silently changes a linked Feature's adoption.
 */
export function featureLocationLifecycleSQL(): SQL<string | null> {
  const operating = sql`CASE json_extract(fp.acceptedOverrides,'$.operatingStatus.mode')
    WHEN 'override' THEN json_extract(fp.acceptedOverrides,'$.operatingStatus.value')
    ELSE ${locationFactsFieldSql(sql.raw('pr.facts'), 'operatingStatus')} END`
  const building = sql`CASE json_extract(fp.acceptedOverrides,'$.buildingStatus.mode')
    WHEN 'override' THEN json_extract(fp.acceptedOverrides,'$.buildingStatus.value')
    ELSE ${locationFactsFieldSql(sql.raw('pr.facts'), 'buildingStatus')} END`
  return sql<
    string | null
  >`(SELECT CASE WHEN ${operating} IS NOT NULL OR ${building} IS NOT NULL
    THEN json_object('operatingStatus',${operating},'buildingStatus',${building}) END
    FROM featureLocation fp JOIN location p ON p.id=fp.locationId
    JOIN locationRevision pr ON pr.id=fp.factsRevisionId AND pr.locationId=fp.locationId
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId")))`
}
