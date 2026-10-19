// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  featurePlace,
  placeAdoptionProposal,
  placeAdoptionDecision,
} from '../schema/place'
// SERVICES
import { previewFeaturePlaceAdoption } from './placeAdoption'
// TYPES
import type { Database } from '#lib/types.js'

type Proposal = typeof placeAdoptionProposal.$inferSelect
type Decision = typeof placeAdoptionDecision.$inferSelect

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SCOPED REVIEW READS
// 2. IDEMPOTENT PROPOSALS
// 3. EXPLICIT REJECTION
// ---

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
    .select({ decision: placeAdoptionDecision })
    .from(placeAdoptionDecision)
    .innerJoin(
      placeAdoptionProposal,
      eq(placeAdoptionProposal.id, placeAdoptionDecision.proposalId),
    )
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
  return { proposal: rows.proposal, decisions: decisions.map(row => row.decision) }
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
    const decided = await db
      .select({ fieldGroup: placeAdoptionDecision.fieldGroup })
      .from(placeAdoptionDecision)
      .innerJoin(
        placeAdoptionProposal,
        eq(placeAdoptionProposal.id, placeAdoptionDecision.proposalId),
      )
      .where(identity)
    if (new Set(decided.map(row => row.fieldGroup)).size === 2) return retained
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
      ${preview.settings.revision}, ${JSON.stringify(evidence)}, strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE EXISTS (SELECT 1 FROM feature f JOIN featurePlace fp ON fp.featureId=f.id
      JOIN place p ON p.id=fp.placeId
      WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND f.modifiedAt=${preview.expectedFeatureModifiedAt} AND fp.revision=${preview.expectedRevision}
      AND fp.placeId=${association.placeId} AND p.sourceAvailability='current'
      AND (p.ownerProjectId IS NULL OR p.ownerProjectId=f.projectId))
    AND COALESCE((SELECT revision FROM projectPlacePolicy WHERE projectId=${input.projectId}),0)=${preview.settings.revision}
    AND (SELECT COUNT(DISTINCT d.fieldGroup) FROM placeAdoptionDecision d JOIN placeAdoptionProposal ap ON ap.id=d.proposalId
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
  const rows = await db
    .insert(placeAdoptionDecision)
    .select(sql`
    SELECT ${crypto.randomUUID()}, ${input.proposalId}, ${input.fieldGroup}, 'rejected',
      ${input.actorId}, ${reason}, ${input.expectedRevision}, strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE EXISTS (SELECT 1 FROM placeAdoptionProposal ap JOIN feature f ON f.id=ap.featureId
      JOIN featurePlace fp ON fp.featureId=f.id
      WHERE ap.id=${input.proposalId} AND ap.featureId=${input.featureId}
      AND ap.projectId=${input.projectId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND fp.placeId=ap.placeId AND fp.revision=${input.expectedRevision}
      AND f.modifiedAt=${input.expectedFeatureModifiedAt}
      AND ((ap.associationRevision=${input.expectedRevision} AND ap.featureModifiedAt=${input.expectedFeatureModifiedAt})
        OR EXISTS (SELECT 1 FROM placeAdoptionDecision prior WHERE prior.proposalId=ap.id
          AND prior.action='applied' AND prior.associationRevision=${input.expectedRevision}))
      AND ap.rowid=(SELECT MAX(newer.rowid) FROM placeAdoptionProposal newer
        WHERE newer.featureId=ap.featureId AND newer.projectId=ap.projectId
          AND newer.placeId=ap.placeId AND newer.candidateRevisionId=ap.candidateRevisionId)
      AND NOT EXISTS (SELECT 1 FROM placeAdoptionDecision d JOIN placeAdoptionProposal older ON older.id=d.proposalId
        WHERE older.featureId=ap.featureId AND older.projectId=ap.projectId
          AND older.placeId=ap.placeId AND older.candidateRevisionId=ap.candidateRevisionId
          AND d.fieldGroup=${input.fieldGroup}))
  `)
    .onConflictDoNothing()
    .returning()
  return rows[0] ?? null
}
