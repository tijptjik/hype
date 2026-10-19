// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { featurePlace, place, placeRevision } from '../schema/place'
// DOMAIN
import { equalPlaceValue } from '#lib/places/baseline.js'
import { planUnresolvedFeatureSplit } from '#lib/places/migrationPlan.js'
// SERVICES
import { readFeaturePlaceBaseline } from './placeBaseline'
import { prepareFeaturePlaceAssociationWrite } from './placeAssociation'
// TYPES
import type { Database } from '#lib/types.js'
import type { UnresolvedFeatureSplit } from '#lib/places/migrationPlan.js'

/**
 * Apply one reviewed unresolved split atomically, or recognize its exact prior application.
 * @param db Local rehearsal or explicitly authorized migration database.
 * @param proposed Private split proposal generated from persisted Feature data.
 * @param actorId Trusted migration actor retained in source provenance and association history.
 * @returns Applied/replayed status, or conflict without changing an existing association.
 * @remarks Internal migration primitive, never a remote client command. Recomputes the
 * proposal from current persisted values; arbitrary manifest facts are not authoritative.
 * Each Feature is one atomic batch. A failed later Feature does not undo completed earlier
 * Features; exact replay supports resumption. No Feature values or spatial jobs are changed.
 */
export async function applyUnresolvedFeatureSplit(
  db: Database,
  proposed: UnresolvedFeatureSplit,
  actorId: string,
): Promise<{ status: 'applied' | 'already-applied' | 'conflict' }> {
  if (!actorId || !proposed?.featureId || !proposed.projectId)
    throw new Error('Incomplete Feature split request')
  const baseline = await readFeaturePlaceBaseline(
    db,
    proposed.featureId,
    proposed.projectId,
  )
  if (baseline.status !== 'ready') return { status: 'conflict' }
  const recomputed = planUnresolvedFeatureSplit(baseline.baseline)
  if (recomputed.status !== 'planned' || !equalPlaceValue(recomputed.plan, proposed))
    return { status: 'conflict' }
  const plan = recomputed.plan
  const association = await db
    .select()
    .from(featurePlace)
    .where(eq(featurePlace.featureId, plan.featureId))
    .get()
  // Replay only the exact completed split, never repair/overwrite a later user decision.
  if (association) {
    const prior = await db
      .select({
        state: place.state,
        ownerProjectId: place.ownerProjectId,
        ssId: place.ssId,
        facts: placeRevision.facts,
        payload: placeRevision.payload,
        origin: placeRevision.origin,
      })
      .from(place)
      .innerJoin(placeRevision, eq(placeRevision.placeId, place.id))
      .where(and(eq(place.id, plan.placeId), eq(placeRevision.id, plan.revisionId)))
      .get()
    return {
      status:
        prior &&
        prior.state === 'unresolved' &&
        prior.ssId === null &&
        prior.ownerProjectId === plan.projectId &&
        prior.origin === 'local' &&
        association.placeId === plan.placeId &&
        association.factsRevisionId === plan.revisionId &&
        association.locationRevisionId === plan.revisionId &&
        equalPlaceValue(association.overrides, plan.overrides) &&
        equalPlaceValue(prior.facts, plan.facts) &&
        equalPlaceValue(prior.payload.plan, plan)
          ? 'already-applied'
          : 'conflict',
    }
  }
  const collision = await db
    .select({ id: place.id })
    .from(place)
    .where(eq(place.id, plan.placeId))
    .get()
  if (collision) return { status: 'conflict' }
  const payload = { kind: 'existing-feature-split', actorId, plan }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const guard = sql`EXISTS (SELECT 1 FROM feature WHERE id=${plan.featureId}
    AND projectId=${plan.projectId} AND modifiedAt=${plan.expectedFeatureModifiedAt}
    AND isDraft=0 AND isIntangible=0)
    AND NOT EXISTS (SELECT 1 FROM featurePlace WHERE featureId=${plan.featureId})`
  const associationWrite = prepareFeaturePlaceAssociationWrite(db, {
    featureId: plan.featureId,
    projectId: plan.projectId,
    expectedFeatureModifiedAt: plan.expectedFeatureModifiedAt,
    expectedRevision: null,
    placeId: plan.placeId,
    factsRevisionId: plan.revisionId,
    locationRevisionId: plan.revisionId,
    overrides: plan.overrides,
    actorId,
  })
  // All three writes use one D1 transaction; a stale guard leaves no orphan Place/revision.
  // Raw SELECT follows schema column order, including nullable source fields and timestamps.
  const results = await db.batch([
    db
      .insert(place)
      .select(sql`SELECT ${plan.placeId},NULL,'unresolved',${plan.projectId},'current',
      strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`),
    db
      .insert(placeRevision)
      .select(sql`SELECT ${plan.revisionId},${plan.placeId},1,'local',
      NULL,NULL,NULL,NULL,${contentHash},${JSON.stringify(payload)},${JSON.stringify(plan.facts)},
      strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`),
    associationWrite.query,
  ])
  return { status: results[2].length ? 'applied' : 'conflict' }
}
