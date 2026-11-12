import { currentLocationFacts, locationReadFields } from './locationReadProjection'
// DRIZZLE
import { and, eq, or, sql } from 'drizzle-orm'
// SCHEMA
import { location, locationRevision } from '../schema/location'
// DOMAIN
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { locationDistance } from '#lib/locations/searchPresentation.js'
// SERVICES
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'
import type { AssociationKind } from '#lib/locations/association.js'

/** Cross-reference accessible latest Location identities independently of discovery filters.
 * @param db Request database. @param input Authorized project, kind and original address pin.
 * @returns Bounded candidates and explicit truncation; no private identity escapes its owner.
 * @remarks Current source records and local identities share this lookup. Names are compared
 * client-side so language normalization is identical for cached and newly fetched candidates.
 */
export async function nearbyAssociationLocations(
  db: Database,
  input: { projectId: string; kind: AssociationKind; coordinates: [number, number] },
): Promise<{
  rows: {
    locationId: string
    revisionId: string
    ssId: string | null
    kind: AssociationKind
    recordMode: 'manual' | 'unlinked' | 'linked'
    facts: LocationFacts
  }[]
  limited: boolean
}> {
  const organisationId =
    (
      await db.get<{ id: string }>(
        sql`SELECT organisationId id FROM project WHERE id=${input.projectId}`,
      )
    )?.id ?? null
  const fields = await locationReadFields(
    db,
    location.id,
    locationRevision.facts,
    sql`${organisationId}`,
    locationRevision.id,
  )
  const [lng, lat] = input.coordinates
  const dy = 100 / 110000
  const dx = dy / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  // Scope and kind precede the cap; stale source identities are not offered as current matches.
  const rows = await db
    .select({
      locationId: location.id,
      revisionId: locationRevision.id,
      ssId: location.ssId,
      state: location.state,
      facts: locationRevision.facts,
    })
    .from(location)
    .innerJoin(locationRevision, eq(locationRevision.locationId, location.id))
    .where(
      and(
        eq(location.kind, input.kind),
        sql`${location.state} != 'redirect'`,
        or(
          sql`${location.state} != 'manual'`,
          eq(location.ownerOrganisationId, locationOwnerForProject(input.projectId)),
        ),
        or(sql`${location.ssId} IS NULL`, eq(location.sourceAvailability, 'current')),
        sql`${locationRevision.version} = (SELECT max(latest.version) FROM locationRevision latest WHERE latest.locationId=${location.id})`,
        sql`json_extract(${fields.location}, '$.geometry.coordinates[0]') BETWEEN ${lng - dx} AND ${lng + dx}`,
        sql`json_extract(${fields.location}, '$.geometry.coordinates[1]') BETWEEN ${lat - dy} AND ${lat + dy}`,
      ),
    )
    .orderBy(location.id)
    .limit(201)
  return {
    rows: (
      await Promise.all(
        rows.slice(0, 200).map(async row => ({
          ...row,
          kind: input.kind,
          recordMode:
            row.state === 'manual'
              ? ('manual' as const)
              : row.ssId
                ? ('linked' as const)
                : ('unlinked' as const),
          facts: await currentLocationFacts(
            db,
            row.locationId,
            LocationFactsSchema.parse(row.facts),
            organisationId,
          ),
        })),
      )
    ).filter(
      row =>
        locationDistance(input.coordinates, row.facts.location.geometry.coordinates) <=
        100,
    ),
    limited: rows.length > 200,
  }
}
