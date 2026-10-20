// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  featurePlace,
  place,
  placeRevision,
  placeAdoptionProposal,
  type PlaceAdoptionDecisionRecord,
} from '../schema/place'
// SERVICES
import { placeOwnerForProject } from './placeScope'
import { previewFeaturePlaceAdoption } from './placeAdoption'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

type Proposal = typeof placeAdoptionProposal.$inferSelect
type Decision = PlaceAdoptionDecisionRecord

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SCOPED REVIEW READS AND PAGINATION
// 2. IDEMPOTENT PROPOSALS
// 3. EXPLICIT REJECTION
// ---

export type PlaceAdoptionReviewSummary = Pick<
  Proposal,
  'id' | 'candidateRevisionId' | 'createdAt' | 'policyRevision'
> & {
  rowNumber: number
  decidedGroups: number
}

/**
 * List the newest assessment for each candidate in bounded, stable pages.
 * @param db Request-local database.
 * @param input Authorized Feature scope and optional previous page cursor.
 * @returns Up to twenty summaries and a continuation cursor, never source payloads.
 * @remarks A cursor only narrows this Feature/project query; it grants no additional access.
 */
export async function listPlaceAdoptionReviews(
  db: Database,
  input: { featureId: string; projectId: string; beforeRow?: number },
): Promise<{ reviews: PlaceAdoptionReviewSummary[]; nextCursor: number | null }> {
  if (
    input.beforeRow !== undefined &&
    (!Number.isSafeInteger(input.beforeRow) || input.beforeRow < 1)
  )
    throw new Error('Invalid Place review cursor')
  const rows = await db
    .select({
      id: placeAdoptionProposal.id,
      candidateRevisionId: placeAdoptionProposal.candidateRevisionId,
      createdAt: placeAdoptionProposal.createdAt,
      policyRevision: placeAdoptionProposal.policyRevision,
      rowNumber: sql<number>`placeAdoptionProposal.rowid`,
      decidedGroups: sql<number>`(SELECT MAX(prior.factsDecision IS NOT NULL) + MAX(prior.locationDecision IS NOT NULL)
      FROM placeAdoptionProposal prior
      WHERE prior.featureId=placeAdoptionProposal.featureId
        AND prior.projectId=placeAdoptionProposal.projectId
        AND prior.placeId=placeAdoptionProposal.placeId
        AND prior.candidateRevisionId=placeAdoptionProposal.candidateRevisionId)`,
    })
    .from(placeAdoptionProposal)
    .innerJoin(feature, eq(feature.id, placeAdoptionProposal.featureId))
    .where(
      and(
        eq(placeAdoptionProposal.featureId, input.featureId),
        eq(placeAdoptionProposal.projectId, input.projectId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
        ...(input.beforeRow === undefined
          ? []
          : [sql`placeAdoptionProposal.rowid < ${input.beforeRow}`]),
        sql`NOT EXISTS (SELECT 1 FROM placeAdoptionProposal newer
        WHERE newer.featureId=placeAdoptionProposal.featureId
          AND newer.projectId=placeAdoptionProposal.projectId
          AND newer.placeId=placeAdoptionProposal.placeId
          AND newer.candidateRevisionId=placeAdoptionProposal.candidateRevisionId
          AND newer.rowid > placeAdoptionProposal.rowid)`,
      ),
    )
    .orderBy(sql`placeAdoptionProposal.rowid DESC`)
    .limit(21)
  return {
    reviews: rows.slice(0, 20),
    nextCursor: rows.length > 20 ? rows[19].rowNumber : null,
  }
}

/**
 * Read retained evidence only through the Feature's current, authorized project.
 * @param db Request-local database.
 * @param input Authorized Feature/project and proposal identity.
 * @returns Immutable evidence and independently recorded group decisions, or null.
 * @remarks Historical rows survive deletion but are not exposed after loss of Feature scope.
 */
export async function readPlaceAdoptionReview(
  db: Database,
  input: { featureId: string; projectId: string; proposalId: string },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const rows = await db
    .select({ proposal: placeAdoptionProposal })
    .from(placeAdoptionProposal)
    .innerJoin(feature, eq(feature.id, placeAdoptionProposal.featureId))
    .where(
      and(
        eq(placeAdoptionProposal.id, input.proposalId),
        eq(placeAdoptionProposal.featureId, input.featureId),
        eq(placeAdoptionProposal.projectId, input.projectId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
      ),
    )
    .get()
  if (!rows) return null
  const decisions = await db
    .select({
      facts: placeAdoptionProposal.factsDecision,
      location: placeAdoptionProposal.locationDecision,
    })
    .from(placeAdoptionProposal)
    .where(
      and(
        eq(placeAdoptionProposal.featureId, rows.proposal.featureId),
        eq(placeAdoptionProposal.projectId, rows.proposal.projectId),
        eq(placeAdoptionProposal.placeId, rows.proposal.placeId),
        eq(
          placeAdoptionProposal.candidateRevisionId,
          rows.proposal.candidateRevisionId,
        ),
      ),
    )
  return {
    proposal: rows.proposal,
    decisions: decisions.flatMap(row =>
      [row.facts, row.location].filter(
        (decision): decision is Decision => decision !== null,
      ),
    ),
  }
}

/**
 * Retain one assessment without replacing prior evidence or reopening rejected groups.
 * @param db Request-local database.
 * @param input Authorized Feature scope and candidate from a verified forward publication.
 * @returns Existing/new proposal and decisions, or null on unavailable/stale inputs.
 * @remarks Selection of a forward canonical publication remains the sync caller's duty.
 * Only an explicit reevaluatePending request can append a replacement assessment, and
 * only for still-pending groups. Prior evidence and all decisions are never rewritten. No Feature changes occur.
 */
export async function proposeFeaturePlaceAdoption(
  db: Database,
  input: {
    featureId: string
    projectId: string
    candidateRevisionId: string
    reevaluatePending?: boolean
    additionalGuard?: SQL
  },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const association = await db
    .select({ placeId: featurePlace.placeId })
    .from(featurePlace)
    .innerJoin(feature, eq(feature.id, featurePlace.featureId))
    .where(
      and(
        eq(featurePlace.featureId, input.featureId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
      ),
    )
    .get()
  if (!association) return null
  const identity = and(
    eq(placeAdoptionProposal.featureId, input.featureId),
    eq(placeAdoptionProposal.projectId, input.projectId),
    eq(placeAdoptionProposal.placeId, association.placeId),
    eq(placeAdoptionProposal.candidateRevisionId, input.candidateRevisionId),
  )
  const previous = await db
    .select({ id: placeAdoptionProposal.id })
    .from(placeAdoptionProposal)
    .where(identity)
    .orderBy(sql`rowid DESC`)
    .get()
  if (previous) {
    const retained = await readPlaceAdoptionReview(db, {
      ...input,
      proposalId: previous.id,
    })
    if (!input.reevaluatePending) return retained
    // Completed groups remain decided across every assessment of this candidate.
    if (new Set(retained?.decisions.map(row => row.fieldGroup)).size === 2)
      return retained
  }
  const preview = await previewFeaturePlaceAdoption(db, input)
  if (!preview) return null
  const id = crypto.randomUUID()
  const evidence = { policy: preview.settings.policy, plan: preview.plan }
  // Persist only while all inputs still match; concurrent proposers converge on one identity.
  await db
    .insert(placeAdoptionProposal)
    .select(sql`
    SELECT ${id}, ${input.featureId}, ${input.projectId}, ${association.placeId},
      ${input.candidateRevisionId}, ${preview.expectedRevision}, ${preview.expectedFeatureModifiedAt},
      ${preview.settings.revision}, ${JSON.stringify(evidence)}, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE (${input.additionalGuard ?? sql`1`}) AND EXISTS (SELECT 1 FROM feature f JOIN featurePlace fp ON fp.featureId=f.id
      JOIN place p ON p.id=fp.placeId
      WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND f.modifiedAt=${preview.expectedFeatureModifiedAt} AND fp.revision=${preview.expectedRevision}
      AND fp.placeId=${association.placeId} AND p.sourceAvailability='current'
      AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id=f.projectId)))
    AND COALESCE((SELECT placePolicyRevision FROM project WHERE id=${input.projectId}),0)=${preview.settings.revision}
    AND (SELECT COALESCE(MAX(ap.factsDecision IS NOT NULL),0) + COALESCE(MAX(ap.locationDecision IS NOT NULL),0) FROM placeAdoptionProposal ap
      WHERE ap.featureId=${input.featureId} AND ap.projectId=${input.projectId}
      AND ap.placeId=${association.placeId} AND ap.candidateRevisionId=${input.candidateRevisionId}) < 2
  `)
    .onConflictDoNothing()
  const retained = await db
    .select({ id: placeAdoptionProposal.id })
    .from(placeAdoptionProposal)
    .where(identity)
    .orderBy(sql`rowid DESC`)
    .get()
  return retained
    ? readPlaceAdoptionReview(db, { ...input, proposalId: retained.id })
    : null
}

/**
 * Reject a pending group without changing accepted source revisions or Feature values.
 * @param db Request-local database.
 * @param input Authorized scope, group, editor tokens and authenticated decision author.
 * @returns Recorded rejection, or null when already decided or the Feature/association changed.
 * @remarks Each group has one durable decision. Retry/sync cannot overwrite or clear it.
 */
export async function rejectPlaceAdoptionGroup(
  db: Database,
  input: {
    featureId: string
    projectId: string
    proposalId: string
    fieldGroup: 'facts' | 'location'
    expectedRevision: string
    expectedFeatureModifiedAt: string
    actorId: string
    reason: string
  },
): Promise<Decision | null> {
  const reason = input.reason.trim()
  if (
    !input.actorId ||
    !reason ||
    reason.length > 2000 ||
    !['facts', 'location'].includes(input.fieldGroup)
  )
    throw new Error('Invalid Place rejection')
  const column =
    input.fieldGroup === 'facts'
      ? placeAdoptionProposal.factsDecision
      : placeAdoptionProposal.locationDecision
  const decision: Decision = {
    id: crypto.randomUUID(),
    proposalId: input.proposalId,
    fieldGroup: input.fieldGroup,
    action: 'rejected',
    actorId: input.actorId,
    reason,
    associationRevision: input.expectedRevision,
    createdAt: new Date().toISOString(),
  }
  const rows = await db
    .update(placeAdoptionProposal)
    .set(
      input.fieldGroup === 'facts'
        ? { factsDecision: decision }
        : { locationDecision: decision },
    )
    .where(sql`placeAdoptionProposal.id=${input.proposalId} AND ${column} IS NULL AND EXISTS (SELECT 1 FROM placeAdoptionProposal ap JOIN feature f ON f.id=ap.featureId
      JOIN featurePlace fp ON fp.featureId=f.id
      WHERE ap.id=${input.proposalId} AND ap.featureId=${input.featureId}
      AND ap.projectId=${input.projectId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND fp.placeId=ap.placeId AND fp.revision=${input.expectedRevision}
      AND f.modifiedAt=${input.expectedFeatureModifiedAt}
      AND ((ap.associationRevision=${input.expectedRevision} AND ap.featureModifiedAt=${input.expectedFeatureModifiedAt})
        OR EXISTS (SELECT 1 FROM json_each(json_array(json(ap.factsDecision),json(ap.locationDecision))) prior
          WHERE json_extract(prior.value,'$.action')='applied' AND json_extract(prior.value,'$.associationRevision')=${input.expectedRevision}))
      AND ap.rowid=(SELECT MAX(newer.rowid) FROM placeAdoptionProposal newer
        WHERE newer.featureId=ap.featureId AND newer.projectId=ap.projectId
          AND newer.placeId=ap.placeId AND newer.candidateRevisionId=ap.candidateRevisionId)
      AND NOT EXISTS (SELECT 1 FROM placeAdoptionProposal older
        WHERE older.featureId=ap.featureId AND older.projectId=ap.projectId
          AND older.placeId=ap.placeId AND older.candidateRevisionId=ap.candidateRevisionId
          AND (CASE WHEN ${input.fieldGroup}='facts' THEN older.factsDecision ELSE older.locationDecision END) IS NOT NULL))
  `)
    .returning({ decision: column })
  return rows[0]?.decision ?? null
}

/**
 * Prepare an explicit review of the newest local address revision for one authorized Feature.
 * @param db Request-local database.
 * @param input Persisted Feature and Project scope.
 * @returns Review evidence, or null when no newer local revision is available.
 */
export async function proposeLatestLocalPlaceAdoption(
  db: Database,
  input: { featureId: string; projectId: string },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const candidate = await db
    .select({ id: placeRevision.id })
    .from(featurePlace)
    .innerJoin(feature, eq(feature.id, featurePlace.featureId))
    .innerJoin(place, eq(place.id, featurePlace.placeId))
    .innerJoin(placeRevision, eq(placeRevision.placeId, place.id))
    .where(
      and(
        eq(feature.id, input.featureId),
        eq(feature.projectId, input.projectId),
        sql`${place.ownerOrganisationId}=${placeOwnerForProject(input.projectId)}`,
        sql`${place.state} IN ('manual','unresolved')`,
        eq(placeRevision.origin, 'local'),
        sql`${placeRevision.sequence}=(SELECT max(r.sequence) FROM placeRevision r WHERE r.placeId=${place.id})`,
        sql`${placeRevision.id} IS NOT ${featurePlace.locationRevisionId}`,
      ),
    )
    .get()
  return candidate
    ? proposeFeaturePlaceAdoption(db, { ...input, candidateRevisionId: candidate.id })
    : null
}
