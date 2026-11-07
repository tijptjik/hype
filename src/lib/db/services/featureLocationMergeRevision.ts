// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/**
 * Records all accepted Feature binding changes caused by a reviewed Location identity merge.
 * @param db Request database.
 * @param input Exact merge receipt, source/survivor identities and review fence.
 * @returns Capture boundaries enclosing the complete existing merge transaction.
 * @remarks This does not merge Feature identities or transfer task/visit history. Immutable
 * Location reference copies follow the merge's deterministic ID mapping; authored content stays intact.
 */
export async function prepareFeatureLocationMergeCapture(db: Database, input: {
  sourceLocationId: string; targetLocationId: string; mergeId: string; actorId: string; guard: SQL
}): Promise<{ before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] }> {
  const result = { before: [] as BatchItem<'sqlite'>[], after: [] as BatchItem<'sqlite'>[] }
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`)
  if (!storage?.n && !await hasFeatureLifecycleStorage(db)) return result
  const selected = sql`SELECT fl.featureId FROM featureLocation fl WHERE fl.locationId=${input.sourceLocationId}
    OR (fl.locationId<>${input.targetLocationId} AND EXISTS (SELECT 1 FROM featureLocationMembership m
      WHERE m.featureId=fl.featureId AND m.containerLocationId=${input.sourceLocationId}))`
  const affected = await db.all<{ featureId: string }>(sql`${selected}`)
  result.before.push(prepareRevisionCheck(db, sql`NOT EXISTS (
    SELECT featureId FROM (${selected}) EXCEPT SELECT value FROM json_each(${JSON.stringify(affected.map(row => row.featureId))}))`))
  const revisions = await db.all<{ id: string; version: number }>(sql`SELECT id,version FROM locationRevision WHERE locationId=${input.sourceLocationId}`)
  const remapped = new Map(revisions.map(row => [row.id, `mergeRevision_${input.mergeId}_${row.version}`]))
  for (const { featureId } of affected) {
    const capture = await prepareFeatureAcceptedCapture(db, {
      featureId, actorId: input.actorId, guard: input.guard, reason: 'Reviewed Location identity merge',
      derive: previous => {
        const content = structuredClone(previous), link = content.placement.location
        if (!link) throw new Error('Feature Location binding changed before merge')
        const direct = link.locationId === input.sourceLocationId
        link.associationVersion = `${direct ? 'mergeAssociation' : 'mergePlacement'}_${input.mergeId}_${featureId}`
        if (direct) {
          const facts = remapped.get(link.factsRevisionId), location = remapped.get(link.locationRevisionId)
          if (!facts || !location) throw new Error('Accepted Location revisions are missing')
          link.locationId = input.targetLocationId
          link.factsRevisionId = facts
          link.locationRevisionId = location
          if (link.factsOrganisationRevision) link.factsOrganisationRevision = `merge:${input.mergeId}:${link.factsOrganisationRevision}`
          if (link.locationOrganisationRevision) link.locationOrganisationRevision = `merge:${input.mergeId}:${link.locationOrganisationRevision}`
        }
        // Canonical container projection changes; retained relationship endpoint IDs do not.
        const memberships = new Map<string, typeof link.memberships[number]>()
        for (const membership of link.memberships) {
          const next = { ...membership, bindingVersion: link.associationVersion,
            containerLocationId: membership.containerLocationId === input.sourceLocationId ? input.targetLocationId : membership.containerLocationId }
          const key = JSON.stringify([next.containerLocationId, next.role]), prior = memberships.get(key)
          if (!prior || (next.occupancyRevisionId && !prior.occupancyRevisionId) ||
            (!prior.occupancyRevisionId && next.membershipRevisionId && prior.membershipRevisionId && next.membershipRevisionId < prior.membershipRevisionId))
            memberships.set(key, next)
        }
        link.memberships = [...memberships.values()].sort((a,b) => a.containerLocationId < b.containerLocationId ? -1 :
          a.containerLocationId > b.containerLocationId ? 1 : a.role < b.role ? -1 : a.role > b.role ? 1 : 0)
        return content
      },
    })
    result.before.push(...capture.before)
    if (capture.revisionId) {
      const now = new Date().toISOString()
      result.after.push(db.update(feature).set({ modifiedAt: sql`CASE WHEN modifiedAt>=${now}
        THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds') ELSE ${now} END` }).where(eq(feature.id, featureId)))
    }
    result.after.push(...capture.after)
  }
  return result
}
