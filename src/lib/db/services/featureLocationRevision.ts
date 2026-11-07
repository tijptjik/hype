// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

type AcceptedLocation = NonNullable<FeatureRevisionContent['placement']['location']>

/**
 * Predicts the membership projection produced by the accepted-association triggers.
 * @param db Request database.
 * @param input Exact future binding token and immutable accepted relationship references.
 * @returns Deterministically ordered building/premises memberships for revision capture.
 * @remarks The enclosing capture verifies the actual trigger output before committing.
 * Canonical identity drift or a trigger contract change therefore rolls the whole write back.
 */
export async function readFeatureLocationRevisionMemberships(
  db: Database,
  input: Pick<AcceptedLocation, 'locationId' | 'associationVersion' | 'occupancyRevisionId' | 'membershipRevisionIds'>,
): Promise<AcceptedLocation['memberships']> {
  const direct = await db.all<AcceptedLocation['memberships'][number]>(sql`
    SELECT l.id AS containerLocationId,l.kind AS role,${input.associationVersion} AS bindingVersion,
      ${input.occupancyRevisionId} AS occupancyRevisionId,NULL AS membershipRevisionId
    FROM location l WHERE l.id=CASE WHEN ${input.occupancyRevisionId} IS NULL THEN ${input.locationId}
      ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId)
        FROM locationOccupancy WHERE id=${input.occupancyRevisionId}) END AND l.kind IN ('building','premises')`)
  const inherited = await db.all<AcceptedLocation['memberships'][number]>(sql`
    SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) AS containerLocationId,
      'premises' AS role,${input.associationVersion} AS bindingVersion,NULL AS occupancyRevisionId,min(m.id) AS membershipRevisionId
    FROM locationMembership m JOIN json_each(${JSON.stringify(input.membershipRevisionIds)}) j ON j.value=m.id
    GROUP BY (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)`)
  const selected = new Map(direct.map(row => [JSON.stringify([row.containerLocationId, row.role]), row]))
  for (const row of inherited) {
    const key = JSON.stringify([row.containerLocationId, row.role])
    if (!selected.has(key)) selected.set(key, row)
  }
  return [...selected.values()].sort((a, b) =>
    a.containerLocationId < b.containerLocationId ? -1 : a.containerLocationId > b.containerLocationId ? 1 :
      a.role < b.role ? -1 : a.role > b.role ? 1 : 0)
}
