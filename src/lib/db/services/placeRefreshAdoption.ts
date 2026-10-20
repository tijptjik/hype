// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlace, placeRevision } from '../schema/place'
// DOMAIN
import { equalPlaceSourceRecord } from '#lib/places/sourceEvidence.js'
import {
  comparePlacePublications,
  readPlacePublicationMetadata,
} from '#lib/places/publication.js'
// SERVICES
import { proposeFeaturePlaceAdoption } from './placeAdoptionReview'
import { applyPlaceAdoptionGroup } from './placeAdoptionApply'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

type Group = 'facts' | 'location'
type GroupResult = 'unchanged' | 'applied' | 'rejected' | 'review'
export type PlaceRefreshAdoptionResult = {
  status: 'processed' | 'review' | 'conflict' | 'superseded' | 'unlinked'
  geometryChanged: boolean
  proposalId?: string
  reason?: 'publication-order' | 'publication-evidence'
  groups: Partial<Record<Group, GroupResult>>
}

/**
 * Assess and automatically adopt eligible source groups for one Feature in a sync run.
 * @param db Primary-session database.
 * @param input Trusted forward-publication candidate, persisted scope and mandatory lease/run fence.
 * @returns Durable review/decision outcomes and whether this invocation changed geometry.
 * @remarks Never re-evaluates stale proposals or reopens rejections. Explicit overrides
 * and Project policy remain authoritative. Retry resumes after a partial group application.
 * The caller advances its durable Feature cursor only while it still owns the run.
 */
export async function adoptRefreshedPlaceForFeature(
  db: Database,
  input: {
    featureId: string
    projectId: string
    placeId: string
    candidateRevisionId: string
    guard: SQL
  },
): Promise<PlaceRefreshAdoptionResult> {
  const result: PlaceRefreshAdoptionResult = {
    status: 'processed',
    geometryChanged: false,
    groups: {},
  }
  /** Read ownership before work. @returns Whether the run fence is currently satisfied. */
  const ownsRun = async (): Promise<boolean> => {
    const row = await db.get<{ owned: number }>(
      sql`SELECT CASE WHEN (${input.guard}) THEN 1 ELSE 0 END AS owned`,
    )
    return row.owned === 1
  }
  /** Read scoped concurrency tokens. @returns Current association or undefined after unlink/reassignment. */
  const current = async (): Promise<
    | {
        revision: string
        modifiedAt: string
        factsRevisionId: string
        locationRevisionId: string
      }
    | undefined
  > =>
    db
      .select({
        revision: featurePlace.revision,
        modifiedAt: feature.modifiedAt,
        factsRevisionId: featurePlace.factsRevisionId,
        locationRevisionId: featurePlace.locationRevisionId,
      })
      .from(featurePlace)
      .innerJoin(feature, eq(feature.id, featurePlace.featureId))
      .where(
        and(
          eq(feature.id, input.featureId),
          eq(feature.projectId, input.projectId),
          eq(featurePlace.placeId, input.placeId),
          eq(feature.isDraft, false),
        ),
      )
      .get()
  if (!(await ownsRun())) return { ...result, status: 'superseded' }
  const initial = await current()
  if (!initial) return { ...result, status: 'unlinked' }
  if (
    initial.factsRevisionId === input.candidateRevisionId &&
    initial.locationRevisionId === input.candidateRevisionId
  )
    return { ...result, groups: { facts: 'unchanged', location: 'unchanged' } }
  const review = await proposeFeaturePlaceAdoption(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    candidateRevisionId: input.candidateRevisionId,
    additionalGuard: input.guard,
  })
  if (!review || review.proposal.placeId !== input.placeId)
    return { ...result, status: (await ownsRun()) ? 'conflict' : 'superseded' }
  result.proposalId = review.proposal.id
  // Global scan chronology cannot authorize rewinding a Feature linked after discovery.
  const candidate = await db
    .select()
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.id, input.candidateRevisionId),
        eq(placeRevision.placeId, input.placeId),
      ),
    )
    .get()
  const acceptedSources = await Promise.all(
    [initial.factsRevisionId, initial.locationRevisionId].map(id =>
      db
        .select()
        .from(placeRevision)
        .where(and(eq(placeRevision.id, id), eq(placeRevision.placeId, input.placeId)))
        .get(),
    ),
  )
  try {
    const publication = readPlacePublicationMetadata(candidate?.payload.meta)
    if (
      acceptedSources.some(source => {
        if (!source) return true
        if (source.id === input.candidateRevisionId) return false
        const transition = comparePlacePublications(
          readPlacePublicationMetadata(source.payload.meta),
          publication,
        )
        if (transition === 'forward') return false
        // Collection page/filter metadata can change the retained revision hash without
        // changing a canonical record in the exact same publication.
        return !(
          transition === 'unchanged' &&
          source.snapshotId === candidate?.snapshotId &&
          source.payload.resource != null &&
          candidate?.payload.resource != null &&
          equalPlaceSourceRecord(source.payload.resource, candidate.payload.resource)
        )
      })
    )
      return {
        ...result,
        status: 'review',
        reason: 'publication-order',
        groups: { facts: 'review', location: 'review' },
      }
  } catch {
    return {
      ...result,
      status: 'review',
      reason: 'publication-evidence',
      groups: { facts: 'review', location: 'review' },
    }
  }
  // Re-read tokens between groups because the first application advances both tokens.
  for (const fieldGroup of ['facts', 'location'] as const) {
    if (!(await ownsRun())) return { ...result, status: 'superseded' }
    const decision = review.decisions.find(value => value.fieldGroup === fieldGroup)
    if (decision) {
      result.groups[fieldGroup] = decision.action === 'applied' ? 'applied' : 'rejected'
      continue
    }
    const state = await current()
    if (!state) return { ...result, status: 'unlinked' }
    const acceptedId =
      fieldGroup === 'facts' ? state.factsRevisionId : state.locationRevisionId
    if (acceptedId === input.candidateRevisionId) {
      result.groups[fieldGroup] = 'unchanged'
      continue
    }
    const applied = await applyPlaceAdoptionGroup(db, {
      featureId: input.featureId,
      projectId: input.projectId,
      proposalId: review.proposal.id,
      fieldGroup,
      mode: 'automatic',
      expectedRevision: state.revision,
      expectedFeatureModifiedAt: state.modifiedAt,
      actorId: 'system:place-refresh',
      reason: 'Automatic adoption under Project Places policy',
      additionalGuard: input.guard,
    })
    if (applied.status === 'conflict')
      return { ...result, status: (await ownsRun()) ? 'conflict' : 'superseded' }
    if (applied.status === 'review') {
      result.status = 'review'
      result.groups[fieldGroup] = 'review'
    } else {
      result.groups[fieldGroup] = 'applied'
      result.geometryChanged ||= applied.geometryChanged
    }
  }
  return result
}
