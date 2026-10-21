// DRIZZLE
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// LOCATION
import { locationSourceReference } from '#lib/locations/kinds.js'
// VALIDATION
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
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
      organisationOverrides: sql<
        string | null
      >`(SELECT overrides FROM organisationLocation WHERE locationId=${locationTable.id} AND organisationId=${input.organisationId ?? null})`,
      organisationRevision: sql<
        string | null
      >`(SELECT revision FROM organisationLocation WHERE locationId=${locationTable.id} AND organisationId=${input.organisationId ?? null})`,
    })
    .from(locationTable)
    .leftJoin(
      locationRevision,
      and(
        eq(locationRevision.locationId, locationTable.id),
        sql`${locationRevision.sequence} = (SELECT max(r.sequence) FROM locationRevision r WHERE r.locationId=${locationTable.id} AND (${locationTable.state}!='linked' OR r.origin='saanseoi'))`,
      ),
    )
    .where(
      and(
        input.organisationId
          ? or(
              sql`${locationTable.state} != 'manual'`,
              eq(locationTable.ownerOrganisationId, input.organisationId),
            )
          : sql`${locationTable.state} != 'manual'`,
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
  const data = rows.slice(0, 25).map(({ organisationOverrides, ...row }) => {
    let facts = row.facts === null ? null : LocationFactsSchema.parse(row.facts)
    if (facts && organisationOverrides) {
      const effective = resolveFeatureLocation(
        facts,
        facts.location,
        JSON.parse(organisationOverrides) as FeatureLocationOverrides,
      )
      facts = {
        names: Object.fromEntries(
          Object.entries(effective.names).filter(
            (pair): pair is [string, string] => pair[1] !== null,
          ),
        ),
        phoneNumber: effective.phoneNumber ?? [],
        brands: effective.brands ?? [],
        location: effective.location ?? facts.location,
      }
    }
    return {
      ...row,
      editingOrganisationId: input.organisationId ?? null,
      sourceReference: locationSourceReference(row.ssId),
      facts,
    }
  })
  return { data, nextCursor: rows.length > 25 ? data.at(-1)!.id : null }
}
