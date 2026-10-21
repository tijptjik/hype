// DRIZZLE
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// LOCATION
import { locationSourceReference } from '#lib/locations/kinds.js'
// VALIDATION
import { LocationFactsSchema } from '#lib/locations/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationResource } from '#lib/locations/resource.js'

/**
 * Read a bounded page of standalone Location projections within an authorized scope.
 * @param db Request-local database.
 * @param input Authorized private owner (or shared only), literal search and ID cursor.
 * @returns Latest facts only, without raw provenance or associated Feature identities.
 * @remarks Authorization precedes this query; ownership is fenced in the read itself.
 */
export async function listLocationResources(
  db: Database,
  input: { organisationId?: string; q?: string; after?: string; id?: string },
): Promise<{ data: LocationResource[]; nextCursor: string | null }> {
  // Fence ownership before pagination; never search superseded revisions or raw payloads.
  const rows = await db
    .select({
      id: locationTable.id,
      ssId: locationTable.ssId,
      kind: locationTable.kind,
      state: locationTable.state,
      sourceAvailability: locationTable.sourceAvailability,
      ownerOrganisationId: locationTable.ownerOrganisationId,
      revisionId: locationRevision.id,
      facts: locationRevision.facts,
    })
    .from(locationTable)
    .leftJoin(
      locationRevision,
      and(
        eq(locationRevision.locationId, locationTable.id),
        sql`${locationRevision.sequence} = (SELECT max(r.sequence) FROM locationRevision r WHERE r.locationId=${locationTable.id})`,
      ),
    )
    .where(
      and(
        input.organisationId
          ? or(
              isNull(locationTable.ownerOrganisationId),
              eq(locationTable.ownerOrganisationId, input.organisationId),
            )
          : isNull(locationTable.ownerOrganisationId),
        input.id ? eq(locationTable.id, input.id) : undefined,
        input.after ? gt(locationTable.id, input.after) : undefined,
        input.q
          ? or(
              eq(locationTable.id, input.q),
              eq(locationTable.ssId, input.q),
              sql`EXISTS (SELECT 1 FROM json_each(${locationRevision.facts}, '$.names') n WHERE n.type='text' AND instr(lower(n.value), lower(${input.q}))>0)`,
            )
          : undefined,
      ),
    )
    .orderBy(locationTable.id)
    .limit(26)
  const data = rows.slice(0, 25).map(row => ({
    ...row,
    sourceReference: locationSourceReference(row.ssId),
    facts: row.facts === null ? null : LocationFactsSchema.parse(row.facts),
  }))
  return { data, nextCursor: rows.length > 25 ? data.at(-1)!.id : null }
}
