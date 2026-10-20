// DRIZZLE
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceResource } from '#lib/places/resource.js'

/**
 * Read a bounded page of standalone Place projections within an authorized scope.
 * @param db Request-local database.
 * @param input Authorized private owner (or shared only), literal search and ID cursor.
 * @returns Latest facts only, without raw provenance or associated Feature identities.
 * @remarks Authorization precedes this query; ownership is fenced in the read itself.
 */
export async function listPlaceResources(
  db: Database,
  input: { projectId?: string; q?: string; after?: string; id?: string },
): Promise<{ data: PlaceResource[]; nextCursor: string | null }> {
  // Fence ownership before pagination; never search superseded revisions or raw payloads.
  const rows = await db
    .select({
      id: place.id,
      ssId: place.ssId,
      state: place.state,
      sourceAvailability: place.sourceAvailability,
      ownerProjectId: place.ownerProjectId,
      revisionId: placeRevision.id,
      facts: placeRevision.facts,
    })
    .from(place)
    .leftJoin(
      placeRevision,
      and(
        eq(placeRevision.placeId, place.id),
        sql`${placeRevision.sequence} = (SELECT max(r.sequence) FROM placeRevision r WHERE r.placeId=${place.id})`,
      ),
    )
    .where(
      and(
        input.projectId
          ? or(isNull(place.ownerProjectId), eq(place.ownerProjectId, input.projectId))
          : isNull(place.ownerProjectId),
        input.id ? eq(place.id, input.id) : undefined,
        input.after ? gt(place.id, input.after) : undefined,
        input.q
          ? or(
              eq(place.id, input.q),
              eq(place.ssId, input.q),
              sql`EXISTS (SELECT 1 FROM json_each(${placeRevision.facts}, '$.names') n WHERE n.type='text' AND instr(lower(n.value), lower(${input.q}))>0)`,
            )
          : undefined,
      ),
    )
    .orderBy(place.id)
    .limit(26)
  const data = rows.slice(0, 25).map(row => ({
    ...row,
    facts: row.facts === null ? null : PlaceFactsSchema.parse(row.facts),
  }))
  return { data, nextCursor: rows.length > 25 ? data.at(-1)!.id : null }
}
