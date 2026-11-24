import { classifyLocationFactsKind } from '#lib/locations/factsKind.js'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureLocation,
  location as locationTable,
  locationRevision,
  locationRevisionInput,
} from '../schema/location'
// DOMAIN
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { planUnresolvedFeatureSplit } from '#lib/locations/migrationPlan.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
// SERVICES
import { readFeatureLocationBaseline } from './locationBaseline'
import { readProjectLocationOwner, locationOwnerForProject } from './locationScope'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
import { prepareOrganisationLocationWrite } from './organisationLocation'
import { prepareFeatureLocationAssociationCapture } from './featureLocationAssociationRevision'
// TYPES
import type { Database } from '#lib/types.js'
import type { UnresolvedFeatureSplit } from '#lib/locations/migrationPlan.js'

/**
 * Apply one reviewed unresolved split atomically, or recognize its exact prior application.
 * @param db Local rehearsal or explicitly authorized migration database.
 * @param proposed Private split proposal generated from persisted Feature data.
 * @param actorId Trusted migration actor retained in source provenance and association history.
 * @returns Applied/replayed status, or conflict without changing an existing association.
 * @remarks Internal migration primitive, never a remote client command. Recomputes the
 * proposal from current persisted values; arbitrary manifest facts are not authoritative.
 * Each Feature is one atomic batch. A failed later Feature does not undo completed earlier
 * Features; exact replay supports resumption. Effective facts and spatial jobs are preserved;
 * detached brands move to the Location and enrolled Features receive an attributed revision.
 */
export async function applyUnresolvedFeatureSplit(
  db: Database,
  proposed: UnresolvedFeatureSplit,
  actorId: string,
): Promise<{ status: 'applied' | 'already-applied' | 'conflict' }> {
  if (!actorId || !proposed?.featureId || !proposed.projectId)
    throw new Error('Incomplete Feature split request')
  const plan = proposed
  const ownerOrganisationId = await readProjectLocationOwner(db, plan.projectId)
  const association = await db
    .select()
    .from(featureLocation)
    .where(eq(featureLocation.featureId, plan.featureId))
    .get()
  // Replay only the exact completed split, never repair/overwrite a later user decision.
  if (association) {
    const prior = await db
      .select({
        state: locationTable.state,
        ownerOrganisationId: locationTable.ownerOrganisationId,
        ssId: locationTable.ssId,
        facts: locationRevision.facts,
        rawSource: locationRevision.rawSource,
        origin: locationRevision.origin,
      })
      .from(locationTable)
      .innerJoin(locationRevision, eq(locationRevision.locationId, locationTable.id))
      .where(
        and(
          eq(locationTable.id, plan.locationId),
          eq(locationRevision.id, plan.revisionId),
        ),
      )
      .get()
    const exact =
      prior &&
      prior.state === 'unresolved' &&
      prior.ssId === null &&
      prior.ownerOrganisationId === ownerOrganisationId &&
      prior.origin === 'local' &&
      association.locationId === plan.locationId &&
      association.factsRevisionId === plan.revisionId &&
      association.locationRevisionId === plan.revisionId &&
      equalLocationValue(association.overrides, plan.overrides) &&
      equalLocationValue(prior.facts, plan.facts) &&
      equalLocationValue(prior.rawSource.plan, plan)
    if (!exact) return { status: 'conflict' }
    // Brands now belong to the Location; recover the verified values for replay planning.
    const baseline = await readFeatureLocationBaseline(
      db,
      plan.featureId,
      plan.projectId,
    )
    if (baseline.status !== 'ready') return { status: 'conflict' }
    baseline.baseline.effective.brands = resolveFeatureLocation(
      plan.facts,
      plan.facts.location,
      plan.overrides,
    ).brands
    const replay = planUnresolvedFeatureSplit(baseline.baseline)
    return {
      status:
        replay.status === 'planned' && equalLocationValue(replay.plan, plan)
          ? 'already-applied'
          : 'conflict',
    }
  }
  const baseline = await readFeatureLocationBaseline(db, plan.featureId, plan.projectId)
  if (baseline.status !== 'ready') return { status: 'conflict' }
  const recomputed = planUnresolvedFeatureSplit(baseline.baseline)
  if (recomputed.status !== 'planned' || !equalLocationValue(recomputed.plan, proposed))
    return { status: 'conflict' }
  const collision = await db
    .select({ id: locationTable.id })
    .from(locationTable)
    .where(eq(locationTable.id, plan.locationId))
    .get()
  if (collision) return { status: 'conflict' }
  const rawSource = { kind: 'existing-feature-split', actorId, plan }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(rawSource)),
  )
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const guard = sql`EXISTS (SELECT 1 FROM feature WHERE id=${plan.featureId}
    AND projectId=${plan.projectId} AND modifiedAt=${plan.expectedFeatureModifiedAt}
    AND isDraft=0 AND isIntangible=0)
    AND ${locationOwnerForProject(plan.projectId)}=${ownerOrganisationId}
    AND NOT EXISTS (SELECT 1 FROM featureLocation WHERE featureId=${plan.featureId})`
  const correction = await prepareOrganisationLocationWrite(db, {
    organisationId: ownerOrganisationId,
    locationId: plan.locationId,
    actorId,
    overrides: plan.overrides,
    guard,
  })
  const associationWrite = prepareFeatureLocationAssociationWrite(db, {
    featureId: plan.featureId,
    projectId: plan.projectId,
    expectedFeatureModifiedAt: plan.expectedFeatureModifiedAt,
    expectedRevision: null,
    locationId: plan.locationId,
    factsRevisionId: plan.revisionId,
    locationRevisionId: plan.revisionId,
    overrides: plan.overrides,
    actorId,
    factsOrganisationRevision: correction.revision,
    locationOrganisationRevision: correction.revision,
    additionalGuard: correction.guard,
  })
  const capture = await prepareFeatureLocationAssociationCapture(db, {
    association: associationWrite.input,
    version: associationWrite.version,
    guard,
    migration: {
      acceptedLocation: resolveFeatureLocation(
        plan.facts,
        plan.facts.location,
        plan.overrides,
      ),
    },
  })
  // All three writes use one D1 transaction; a stale guard leaves no orphan Location/revision.
  // Raw SELECT follows schema column order, including nullable source fields and timestamps.
  const results = await db.batch([
    ...capture.before,
    db
      .insert(locationTable)
      .select(sql`SELECT ${plan.locationId},NULL,${locationTaxonomy(classifyLocationFactsKind('unknown', plan.facts)).kind},${locationTaxonomy(classifyLocationFactsKind('unknown', plan.facts)).class},${ownerOrganisationId},'unresolved','current',
      NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`),
    db
      .insert(locationRevisionInput)
      .select(sql`SELECT ${plan.revisionId},${plan.locationId},1,'local',
      NULL,NULL,NULL,NULL,${contentHash},${JSON.stringify(rawSource)},${serializeLocationFacts(plan.facts, 'unknown')},
      strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`),
    ...correction.queries,
    associationWrite.query,
    ...capture.after,
  ] as [
    import('drizzle-orm/batch').BatchItem<'sqlite'>,
    ...import('drizzle-orm/batch').BatchItem<'sqlite'>[],
  ])
  return {
    status: (
      results[capture.before.length + 2 + correction.queries.length] as unknown[]
    ).length
      ? 'applied'
      : 'conflict',
  }
}
