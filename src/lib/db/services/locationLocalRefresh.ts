// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { locationRefreshItem } from '../schema/locationRefresh'
import { featureLocation, locationRevision } from '../schema/location'
import { feature } from '../schema/feature'
// SERVICES
import { proposeFeatureLocationAdoption } from './locationAdoptionReview'
import { applyLocationAdoptionGroup } from './locationAdoptionApply'
import { readOrganisationLocation } from './organisationLocation'
// TYPES
import type { Database } from '#lib/types.js'

/** Process one durable local baseline/Organisation change and one associated Feature.
 * @param db Primary-session database.
 * @returns Bounded progress; reviews remain in the existing Feature task/review workflow.
 * @remarks Uses the same proposal decisions and Project policies as source refresh. Each
 * cursor advances only after its Feature outcome is durable; retries never reopen rejections.
 */
export async function processLocalLocationChanges(
  db: Database,
): Promise<'idle' | 'processed' | 'review' | 'progress' | 'conflict'> {
  const item = await db
    .select()
    .from(locationRefreshItem)
    .where(
      and(
        eq(locationRefreshItem.origin, 'local'),
        eq(locationRefreshItem.status, 'pending'),
      ),
    )
    .orderBy(sql`rowid`)
    .get()
  if (!item) return 'idle'
  const row = await db
    .select({
      id: feature.id,
      projectId: feature.projectId,
      associationRevision: featureLocation.revision,
      factsRevisionId: featureLocation.factsRevisionId,
      locationRevisionId: featureLocation.locationRevisionId,
      factsOrganisationRevision: featureLocation.factsOrganisationRevision,
      locationOrganisationRevision: featureLocation.locationOrganisationRevision,
    })
    .from(feature)
    .innerJoin(featureLocation, eq(featureLocation.featureId, feature.id))
    .where(
      and(
        eq(featureLocation.locationId, item.locationId),
        eq(feature.isDraft, false),
        sql`${feature.id}>${item.featureCursor}`,
        item.organisationId
          ? sql`(SELECT organisationId FROM project WHERE id=${feature.projectId})=${item.organisationId}`
          : undefined,
      ),
    )
    .orderBy(feature.id)
    .get()
  if (!row) {
    await db
      .update(locationRefreshItem)
      .set({ status: 'processed' })
      .where(
        and(
          eq(locationRefreshItem.runId, item.runId),
          eq(locationRefreshItem.locationId, item.locationId),
          eq(locationRefreshItem.featureCursor, item.featureCursor),
          eq(locationRefreshItem.status, 'pending'),
        ),
      )
    return 'processed'
  }
  const baseline = await db
    .select({ id: locationRevision.id })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.locationId, item.locationId),
        sql`EXISTS(SELECT 1 FROM location p WHERE p.id=${item.locationId} AND (p.state!='linked' OR ${locationRevision.origin}='saanseoi'))`,
      ),
    )
    .orderBy(sql`sequence DESC`)
    .get()
  if (!baseline) return 'conflict'
  const candidateRevisionId = baseline.id
  const correction = item.organisationId
    ? await readOrganisationLocation(db, item.organisationId, item.locationId)
    : null
  const guard = sql`EXISTS(SELECT 1 FROM locationRefreshItem WHERE runId=${item.runId} AND locationId=${item.locationId} AND origin='local' AND status='pending' AND featureCursor=${item.featureCursor})`
  // Initial links already accept the head; do not manufacture reviews or Feature writes for them.
  if (
    row.factsRevisionId === candidateRevisionId &&
    row.locationRevisionId === candidateRevisionId &&
    (!correction ||
      (row.factsOrganisationRevision === correction.revision &&
        row.locationOrganisationRevision === correction.revision))
  ) {
    const changed = await db
      .update(locationRefreshItem)
      .set({ featureCursor: row.id })
      .where(
        and(
          eq(locationRefreshItem.runId, item.runId),
          eq(locationRefreshItem.locationId, item.locationId),
          guard,
          sql`EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${row.id} AND revision=${row.associationRevision})`,
        ),
      )
      .returning({ id: locationRefreshItem.locationId })
    return changed.length ? 'progress' : 'conflict'
  }
  const review = await proposeFeatureLocationAdoption(db, {
    featureId: row.id,
    projectId: row.projectId,
    candidateRevisionId,
    organisationRevision: correction?.revision,
    additionalGuard: guard,
  })
  let held = false,
    geometryChanged = 0
  if (!review) return 'conflict'
  if (review) {
    for (const fieldGroup of ['facts', 'location'] as const) {
      if (review.decisions.some(d => d.fieldGroup === fieldGroup)) continue
      const current = await db
        .select({ revision: featureLocation.revision, modifiedAt: feature.modifiedAt })
        .from(featureLocation)
        .innerJoin(feature, eq(feature.id, featureLocation.featureId))
        .where(eq(feature.id, row.id))
        .get()
      if (!current) return 'conflict'
      const result = await applyLocationAdoptionGroup(db, {
        featureId: row.id,
        projectId: row.projectId,
        proposalId: review.proposal.id,
        fieldGroup,
        mode: 'automatic',
        expectedRevision: current.revision,
        expectedFeatureModifiedAt: current.modifiedAt,
        actorId: item.actorId ?? 'system:location-local-refresh',
        reason: 'Adopt local Location changes under Project policy',
        additionalGuard: guard,
      })
      if (result.status === 'conflict') return 'conflict'
      held ||= result.status === 'review'
      if (result.status === 'applied')
        geometryChanged ||= Number(result.geometryChanged)
    }
  }
  await db
    .update(locationRefreshItem)
    .set({
      featureCursor: row.id,
      outcomes: {
        ...item.outcomes,
        [row.id]: {
          projectId: row.projectId,
          proposalId: review?.proposal.id,
          outcome: held ? 'review' : 'processed',
          geometryChanged,
        },
      },
    })
    .where(
      and(
        eq(locationRefreshItem.runId, item.runId),
        eq(locationRefreshItem.locationId, item.locationId),
        guard,
      ),
    )
  return held ? 'review' : 'progress'
}
