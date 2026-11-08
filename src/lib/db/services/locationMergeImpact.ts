// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SERVICES
import { canonicalLocationSQL } from './locationRedirect'
// TYPES
import type { Database } from '#lib/types.js'

import type { LocationMergeImpact } from '#lib/locations/merge.types.js'
/** Fence every immutable dependency and affected binding, including both identities' histories.
 * @param source Absorbed identity.
 * @param target Surviving identity.
 * @returns Stable scalar signature.
 */
export function mergeDependencyToken(source: string, target: string): SQL {
  // Cycle detection traverses intermediate memberships and canonical redirects, not just the endpoints.
  const ids = JSON.stringify([source, target])
  return sql`(SELECT json_group_array(key) FROM (
 SELECT 'address:'||id key FROM locationAddress WHERE locationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids})))
 UNION ALL SELECT 'membership:'||id FROM locationMembership WHERE childLocationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids}))) OR parentLocationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids})))
 UNION ALL SELECT 'cycle-membership:'||id FROM locationMembership
 UNION ALL SELECT 'cycle-alias:'||json_array(aliasId,locationId) FROM locationCanonical WHERE aliasId IN(SELECT childLocationId FROM locationMembership UNION SELECT parentLocationId FROM locationMembership)
 UNION ALL SELECT 'occupancy:'||id FROM locationOccupancy WHERE establishmentLocationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids}))) OR containerLocationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids})))
 UNION ALL SELECT 'transition:'||transitionRevisionId||':'||locationId||':'||side FROM locationTransitionParticipant WHERE locationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids})))
 UNION ALL SELECT 'correction:'||id FROM organisationLocation WHERE locationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids})))
 UNION ALL SELECT 'binding:'||b.featureId||':'||b.version FROM featureLocation b WHERE b.locationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids}))) OR EXISTS(SELECT 1 FROM featureLocationMembership m WHERE m.featureId=b.featureId AND m.containerLocationId IN(SELECT aliasId FROM locationCanonical WHERE locationId IN(SELECT value FROM json_each(${ids}))))
 ORDER BY key))`
}
/** Capture dependency counts and semantic conflicts before any merge is authorized.
 * @param db Request database.
 * @param source Absorbed identity.
 * @param target Survivor.
 *
 * @returns Public-safe counts and actionable blockers, never another Organisation's correction text.
 */
export async function assessMergeDependencies(
  db: Database,
  source: string,
  target: string,
): Promise<LocationMergeImpact> {
  const token = (await db.get<{ value: string }>(
    sql`SELECT ${mergeDependencyToken(source, target)} value`,
  ))!.value
  const keys = JSON.parse(token) as string[]
  const blockers: string[] = []
  const kinds = await db.all<{ id: string; kind: string }>(
    sql`SELECT id,kind FROM location WHERE id IN(${source},${target})`,
  )
  if (
    kinds.length !== 2 ||
    (kinds.every(k => k.kind !== 'unknown') && kinds[0].kind !== kinds[1].kind)
  )
    blockers.push('incompatible-location-kinds')
  if (
    await db.get(
      sql`SELECT 1 FROM organisationLocationHead a JOIN organisationLocationHead b ON a.organisationId=b.organisationId WHERE a.locationId=${source} AND b.locationId=${target} LIMIT 1`,
    )
  )
    blockers.push('overlapping-organisation-corrections')
  // Resolve each Organisation independently: incompatible assertions from different scopes do not form a real cycle.
  const child = canonicalLocationSQL(sql`r.childLocationId`)
  const parent = canonicalLocationSQL(sql`r.parentLocationId`)
  const cycle = await db.get<{ self: number }>(sql`WITH RECURSIVE scopes(scope) AS (
    SELECT NULL UNION SELECT scopeOrganisationId FROM locationMembershipHead WHERE scopeOrganisationId IS NOT NULL
  ), edges(scope,child,parent) AS (
    SELECT scopes.scope,CASE WHEN ${child}=${source} THEN ${target} ELSE ${child} END,CASE WHEN ${parent}=${source} THEN ${target} ELSE ${parent} END
    FROM scopes JOIN locationMembershipHead r ON (r.scopeOrganisationId IS scopes.scope OR (r.scopeOrganisationId IS NULL AND NOT EXISTS(SELECT 1 FROM locationMembershipHead o WHERE o.relationshipId=r.relationshipId AND o.scopeOrganisationId IS scopes.scope AND scopes.scope IS NOT NULL)))
    WHERE r.assertionState='asserted'
  ), paths(scope,start,finish) AS (
    SELECT scope,child,parent FROM edges UNION SELECT p.scope,p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish AND e.scope IS p.scope
  ) SELECT EXISTS(SELECT 1 FROM edges WHERE child=${target} AND parent=${target}) self FROM paths WHERE start=finish AND start=${target} LIMIT 1`)
  if (cycle)
    blockers.push(
      cycle.self ? 'self-membership-after-merge' : 'membership-cycle-after-merge',
    )
  return {
    version: 1,
    token,
    relationshipVersions: keys.filter(k => /^(address|membership|occupancy):/.test(k))
      .length,
    transitionVersions: keys.filter(k => k.startsWith('transition:')).length,
    correctionVersions: keys.filter(k => k.startsWith('correction:')).length,
    acceptedPlacements: keys.filter(k => k.startsWith('binding:')).length,
    blockers,
  }
}
