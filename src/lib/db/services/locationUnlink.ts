// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featureLocation } from '../schema/location'
// SERVICES
import { getAcceptedFeatureLocation } from './location'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Detach one Feature while retaining its materialized fields and complete brand array.
 * @param db Request-local database with atomic batch support.
 * @param input Authorized Feature scope, actor and both editor concurrency tokens.
 * @returns Unlinked token or a non-mutating stale/inaccessible conflict.
 * @remarks Internal lifecycle primitive; callers must authorize all inherited fields.
 * Names, phones, geometry and addresses already live on the Feature. Only brands need
 * a detached projection. No Location, source revision, other Feature or routing job changes.
 */
export async function unlinkFeatureLocation(
  db: Database,
  input: {
    featureId: string
    projectId: string
    expectedFeatureModifiedAt: string
    expectedRevision: string
    actorId: string
  },
): Promise<{ status: 'unlinked'; revision: string } | { status: 'conflict' }> {
  if (Object.values(input).some(value => !value))
    throw new Error('Incomplete Location unlink')
  const current = await getAcceptedFeatureLocation(db, input.featureId, input.projectId)
  if (!current || current.version !== input.expectedRevision)
    return { status: 'conflict' }
  const revision = crypto.randomUUID()
  const guard = sql`EXISTS (SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id
    JOIN location p ON p.id=fp.locationId
    WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id=f.projectId))
      AND f.modifiedAt=${input.expectedFeatureModifiedAt} AND fp.version=${input.expectedRevision})`
  const detachedGuard = sql`EXISTS (SELECT 1 FROM feature f
    WHERE f.id=${input.featureId} AND json_extract(f.localLocationBrands,'$.revision')=${revision})`
  // The unique detached token fences every subsequent write; batch failure restores all rows.
  const capture = await prepareFeatureAcceptedCapture(db, {
    featureId: input.featureId,
    actorId: input.actorId,
    guard,
    reason: 'Feature detached from shared Location',
    derive: previous => {
      const content = structuredClone(previous)
      if (content.placement.location?.associationVersion !== input.expectedRevision)
        throw new Error('Accepted Feature Location changed')
      content.placement.location = null
      content.detachedBrands = current.effective.brands ?? []
      return content
    },
  })
  const results = await executeRevisionBatch(db, guard, [
    ...capture.before,
    db
      .update(feature)
      .set({
        localLocationBrands: {
          brands: current.effective.brands ?? [],
          revision,
          sourceAssociationRevision: input.expectedRevision,
          actorId: input.actorId,
        },
        modifiedAt: new Date(
          Math.max(Date.now(), (Date.parse(input.expectedFeatureModifiedAt) || 0) + 1),
        ).toISOString(),
      })
      .where(sql`${feature.id}=${input.featureId} AND ${guard}`),
    db
      .delete(featureLocation)
      .where(sql`${featureLocation.featureId}=${input.featureId}
      AND ${featureLocation.version}=${input.expectedRevision} AND ${detachedGuard}`)
      .returning({ featureId: featureLocation.featureId }),
    ...capture.after,
  ])
  return results && (results[capture.before.length + 1] as unknown[]).length
    ? { status: 'unlinked', revision }
    : { status: 'conflict' }
}
