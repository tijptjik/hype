// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlace } from '../schema/place'
// SERVICES
import { getAcceptedFeaturePlace } from './place'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Detach one Feature while retaining its materialized fields and complete brand array.
 * @param db Request-local database with atomic batch support.
 * @param input Authorized Feature scope, actor and both editor concurrency tokens.
 * @returns Unlinked token or a non-mutating stale/inaccessible conflict.
 * @remarks Internal lifecycle primitive; callers must authorize all inherited fields.
 * Names, phones, geometry and addresses already live on the Feature. Only brands need
 * a detached projection. No Place, source revision, other Feature or routing job changes.
 */
export async function unlinkFeaturePlace(
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
    throw new Error('Incomplete Place unlink')
  const current = await getAcceptedFeaturePlace(db, input.featureId, input.projectId)
  if (!current || current.revision !== input.expectedRevision)
    return { status: 'conflict' }
  const revision = crypto.randomUUID()
  const guard = sql`EXISTS (SELECT 1 FROM feature f JOIN featurePlace fp ON fp.featureId=f.id
    JOIN place p ON p.id=fp.placeId
    WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id=f.projectId))
      AND f.modifiedAt=${input.expectedFeatureModifiedAt} AND fp.revision=${input.expectedRevision})`
  const detachedGuard = sql`EXISTS (SELECT 1 FROM feature f
    WHERE f.id=${input.featureId} AND json_extract(f.localPlaceBrands,'$.revision')=${revision})`
  // The unique detached token fences every subsequent write; batch failure restores all rows.
  const results = await db.batch([
    db
      .update(feature)
      .set({
        localPlaceBrands: {
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
      .delete(featurePlace)
      .where(sql`${featurePlace.featureId}=${input.featureId}
      AND ${featurePlace.revision}=${input.expectedRevision} AND ${detachedGuard}`)
      .returning({ featureId: featurePlace.featureId }),
  ])
  return results[1].length ? { status: 'unlinked', revision } : { status: 'conflict' }
}
