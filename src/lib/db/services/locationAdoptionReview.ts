import { readSharedLocationCorrection } from './locationShared'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  featureLocation,
  locationRevision,
  locationAdoptionProposal,
  type LocationAdoptionDecisionRecord,
} from '../schema/location'
// DOMAIN
import { readLocationAdoptionPlan } from '#lib/locations/adoption.js'
// SERVICES
import { previewFeatureLocationAdoption } from './locationAdoption'
import { readOrganisationLocation } from './organisationLocation'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

type StoredProposal = typeof locationAdoptionProposal.$inferSelect
type Proposal = Omit<StoredProposal, 'evidence'> & {
  evidence: Omit<StoredProposal['evidence'], 'plan'> & {
    plan: ReturnType<typeof readLocationAdoptionPlan>
  }
}
type Decision = LocationAdoptionDecisionRecord

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SCOPED REVIEW READS AND PAGINATION
// 2. IDEMPOTENT PROPOSALS
// 3. EXPLICIT REJECTION
// ---

export type LocationAdoptionReviewSummary = Pick<
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
export async function listLocationAdoptionReviews(
  db: Database,
  input: { featureId: string; projectId: string; beforeRow?: number },
): Promise<{ reviews: LocationAdoptionReviewSummary[]; nextCursor: number | null }> {
  if (
    input.beforeRow !== undefined &&
    (!Number.isSafeInteger(input.beforeRow) || input.beforeRow < 1)
  )
    throw new Error('Invalid Location review cursor')
  const rows = await db
    .select({
      id: locationAdoptionProposal.id,
      candidateRevisionId: locationAdoptionProposal.candidateRevisionId,
      createdAt: locationAdoptionProposal.createdAt,
      policyRevision: locationAdoptionProposal.policyRevision,
      rowNumber: sql<number>`locationAdoptionProposal.rowid`,
      decidedGroups: sql<number>`(SELECT MAX(prior.factsDecision IS NOT NULL) + MAX(prior.locationDecision IS NOT NULL)
      FROM locationAdoptionProposal prior
      WHERE prior.featureId=locationAdoptionProposal.featureId
        AND prior.projectId=locationAdoptionProposal.projectId
        AND prior.locationId=locationAdoptionProposal.locationId
        AND prior.candidateRevisionId=locationAdoptionProposal.candidateRevisionId AND prior.organisationRevision=locationAdoptionProposal.organisationRevision AND json_extract(prior.evidence,'$.sharedRevision') IS json_extract(locationAdoptionProposal.evidence,'$.sharedRevision') AND prior.occupancyRevisionId IS locationAdoptionProposal.occupancyRevisionId AND prior.addressRevisionId IS locationAdoptionProposal.addressRevisionId)`,
    })
    .from(locationAdoptionProposal)
    .innerJoin(feature, eq(feature.id, locationAdoptionProposal.featureId))
    .where(
      and(
        eq(locationAdoptionProposal.featureId, input.featureId),
        eq(locationAdoptionProposal.projectId, input.projectId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
        ...(input.beforeRow === undefined
          ? []
          : [sql`locationAdoptionProposal.rowid < ${input.beforeRow}`]),
        sql`NOT EXISTS (SELECT 1 FROM locationAdoptionProposal newer
        WHERE newer.featureId=locationAdoptionProposal.featureId
          AND newer.projectId=locationAdoptionProposal.projectId
          AND newer.locationId=locationAdoptionProposal.locationId
          AND newer.candidateRevisionId=locationAdoptionProposal.candidateRevisionId
          AND newer.organisationRevision=locationAdoptionProposal.organisationRevision AND json_extract(newer.evidence,'$.sharedRevision') IS json_extract(locationAdoptionProposal.evidence,'$.sharedRevision') AND newer.occupancyRevisionId IS locationAdoptionProposal.occupancyRevisionId AND newer.addressRevisionId IS locationAdoptionProposal.addressRevisionId
          AND newer.rowid > locationAdoptionProposal.rowid)`,
      ),
    )
    .orderBy(sql`locationAdoptionProposal.rowid DESC`)
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
export async function readLocationAdoptionReview(
  db: Database,
  input: { featureId: string; projectId: string; proposalId: string },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const rows = await db
    .select({ proposal: locationAdoptionProposal })
    .from(locationAdoptionProposal)
    .innerJoin(feature, eq(feature.id, locationAdoptionProposal.featureId))
    .where(
      and(
        eq(locationAdoptionProposal.id, input.proposalId),
        eq(locationAdoptionProposal.featureId, input.featureId),
        eq(locationAdoptionProposal.projectId, input.projectId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
      ),
    )
    .get()
  if (!rows) return null
  if (rows.proposal.evidence.placement) {
    const allowed =
      await db.get(sql`SELECT 1 FROM feature f JOIN project p ON p.id=f.projectId JOIN location l ON l.id=${rows.proposal.locationId} WHERE f.id=${input.featureId} AND p.id=${input.projectId} AND (l.state!='manual' OR l.ownerOrganisationId=p.organisationId)
      AND NOT EXISTS(SELECT 1 FROM locationOccupancy o JOIN location c ON c.id=o.containerLocationId WHERE o.id=${rows.proposal.occupancyRevisionId} AND c.state='manual' AND c.ownerOrganisationId!=p.organisationId)
      AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(rows.proposal.evidence.placement.membershipRevisionIds)}) j JOIN locationMembership m ON m.id=j.value JOIN location c ON c.id=m.parentLocationId OR c.id=m.childLocationId WHERE c.state='manual' AND c.ownerOrganisationId!=p.organisationId)`)
    if (!allowed) return null
  }
  const decisions = await db
    .select({
      facts: locationAdoptionProposal.factsDecision,
      location: locationAdoptionProposal.locationDecision,
    })
    .from(locationAdoptionProposal)
    .where(
      and(
        sql`json_extract(evidence,'$.sharedRevision') IS ${rows.proposal.evidence.sharedRevision ?? null}`,
        eq(locationAdoptionProposal.featureId, rows.proposal.featureId),
        sql`occupancyRevisionId IS ${rows.proposal.occupancyRevisionId} AND addressRevisionId IS ${rows.proposal.addressRevisionId}`,
        eq(locationAdoptionProposal.projectId, rows.proposal.projectId),
        eq(locationAdoptionProposal.locationId, rows.proposal.locationId),
        eq(
          locationAdoptionProposal.candidateRevisionId,
          rows.proposal.candidateRevisionId,
        ),
        eq(
          locationAdoptionProposal.organisationRevision,
          rows.proposal.organisationRevision,
        ),
      ),
    )
  return {
    proposal: {
      ...rows.proposal,
      evidence: {
        ...rows.proposal.evidence,
        plan: readLocationAdoptionPlan(rows.proposal.evidence.plan),
      },
    },
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
export async function proposeFeatureLocationAdoption(
  db: Database,
  input: {
    featureId: string
    projectId: string
    candidateRevisionId: string
    organisationRevision?: string
    reevaluatePending?: boolean
    additionalGuard?: SQL
  },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const association = await db
    .select({ locationId: featureLocation.locationId })
    .from(featureLocation)
    .innerJoin(feature, eq(feature.id, featureLocation.featureId))
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
      ),
    )
    .get()
  if (!association) return null
  const sharedHead = await readSharedLocationCorrection(db, association.locationId)
  const sharedRevision = sharedHead?.id ?? null
  const identity = and(
    sql`json_extract(locationAdoptionProposal.evidence,'$.sharedRevision') IS ${sharedRevision}`,
    sql`locationAdoptionProposal.occupancyRevisionId IS NULL AND locationAdoptionProposal.addressRevisionId IS NULL`,
    eq(locationAdoptionProposal.featureId, input.featureId),
    eq(locationAdoptionProposal.projectId, input.projectId),
    eq(locationAdoptionProposal.locationId, association.locationId),
    eq(locationAdoptionProposal.candidateRevisionId, input.candidateRevisionId),
    eq(locationAdoptionProposal.organisationRevision, input.organisationRevision ?? ''),
  )
  const previous = await db
    .select({ id: locationAdoptionProposal.id })
    .from(locationAdoptionProposal)
    .where(identity)
    .orderBy(sql`rowid DESC`)
    .get()
  if (previous) {
    const retained = await readLocationAdoptionReview(db, {
      ...input,
      proposalId: previous.id,
    })
    if (!input.reevaluatePending) return retained
    // Completed groups remain decided across every assessment of this candidate.
    if (new Set(retained?.decisions.map(row => row.fieldGroup)).size === 2)
      return retained
  }
  const preview = await previewFeatureLocationAdoption(db, input)
  if (!preview || preview.sharedRevision !== sharedRevision) return null
  const id = crypto.randomUUID()
  const evidence = {
    policy: preview.settings.policy,
    plan: preview.plan,
    candidateOverrides: preview.candidateOverrides,
    sharedRevision: preview.sharedRevision,
  }
  // Persist only while all inputs still match; concurrent proposers converge on one identity.
  // INSERT SELECT follows the Drizzle column order: createdAt follows the placement fields.
  await db
    .insert(locationAdoptionProposal)
    .select(sql`
    SELECT ${id}, ${input.featureId}, ${input.projectId}, ${association.locationId},
      ${input.candidateRevisionId}, ${preview.expectedRevision}, ${preview.expectedFeatureModifiedAt},
      ${preview.settings.revision}, ${JSON.stringify(evidence)},${input.organisationRevision ?? ''}, NULL, NULL,NULL,NULL,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE (${input.additionalGuard ?? sql`1`}) AND EXISTS (SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id
      JOIN location p ON p.id=fp.locationId
      WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND COALESCE(json_extract(f.addressMeta,'$.address.association.mode'),'')!='manual'
      AND f.modifiedAt=${preview.expectedFeatureModifiedAt} AND fp.version=${preview.expectedRevision}
      AND fp.locationId=${association.locationId} AND p.sourceAvailability='current'
      AND (p.state!='manual' OR p.ownerOrganisationId=(SELECT organisationId FROM project WHERE id=f.projectId)))
    AND COALESCE((SELECT locationPolicyRevision FROM project WHERE id=${input.projectId}),0)=${preview.settings.revision}
    AND (SELECT COALESCE(MAX(ap.factsDecision IS NOT NULL),0) + COALESCE(MAX(ap.locationDecision IS NOT NULL),0) FROM locationAdoptionProposal ap
      WHERE ap.featureId=${input.featureId} AND ap.projectId=${input.projectId} AND json_extract(ap.evidence,'$.placement') IS NULL
      AND ap.locationId=${association.locationId} AND ap.candidateRevisionId=${input.candidateRevisionId} AND ap.organisationRevision=${input.organisationRevision ?? ''} AND json_extract(ap.evidence,'$.sharedRevision') IS ${sharedRevision}) < 2
  `)
    .onConflictDoNothing()
  const retained = await db
    .select({ id: locationAdoptionProposal.id })
    .from(locationAdoptionProposal)
    .where(identity)
    .orderBy(sql`rowid DESC`)
    .get()
  return retained
    ? readLocationAdoptionReview(db, { ...input, proposalId: retained.id })
    : null
}

/**
 * Reject a pending group without changing accepted source revisions or Feature values.
 * @param db Request-local database.
 * @param input Authorized scope, group, editor tokens and authenticated decision author.
 * @returns Recorded rejection, or null when already decided or the Feature/association changed.
 * @remarks Each group has one durable decision. Retry/sync cannot overwrite or clear it.
 */
export async function rejectLocationAdoptionGroup(
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
    throw new Error('Invalid Location rejection')
  const { hasFeatureLifecycleStorage } = await import('./featureLifecycle')
  if (await hasFeatureLifecycleStorage(db)) {
    const { applyOrganisationLocationAdoption } = await import(
      './locationOrganisationAdoption'
    )
    const result = await applyOrganisationLocationAdoption(
      db,
      { ...input, mode: 'reviewed' },
      true,
    )
    if (result.status !== 'applied') return null
    const reviewed = await readLocationAdoptionReview(db, input)
    return reviewed?.decisions.find(row => row.fieldGroup === input.fieldGroup) ?? null
  }
  const column =
    input.fieldGroup === 'facts'
      ? locationAdoptionProposal.factsDecision
      : locationAdoptionProposal.locationDecision
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
    .update(locationAdoptionProposal)
    .set(
      input.fieldGroup === 'facts'
        ? { factsDecision: decision }
        : { locationDecision: decision },
    )
    .where(sql`locationAdoptionProposal.id=${input.proposalId} AND json_extract(locationAdoptionProposal.evidence,'$.placement') IS NULL AND ${column} IS NULL AND EXISTS (SELECT 1 FROM locationAdoptionProposal ap JOIN feature f ON f.id=ap.featureId
      JOIN featureLocation fp ON fp.featureId=f.id
      WHERE ap.id=${input.proposalId} AND ap.featureId=${input.featureId}
      AND ap.projectId=${input.projectId} AND f.projectId=${input.projectId} AND f.isDraft=0
      AND fp.locationId=ap.locationId AND fp.version=${input.expectedRevision}
      AND f.modifiedAt=${input.expectedFeatureModifiedAt}
      AND ((ap.associationRevision=${input.expectedRevision} AND ap.featureModifiedAt=${input.expectedFeatureModifiedAt})
        OR EXISTS (SELECT 1 FROM json_each(json_array(json(ap.factsDecision),json(ap.locationDecision))) prior
          WHERE json_extract(prior.value,'$.action')='applied' AND json_extract(prior.value,'$.associationRevision')=${input.expectedRevision}))
      AND ap.rowid=(SELECT MAX(newer.rowid) FROM locationAdoptionProposal newer
        WHERE newer.featureId=ap.featureId AND newer.projectId=ap.projectId
          AND newer.locationId=ap.locationId AND newer.candidateRevisionId=ap.candidateRevisionId AND newer.organisationRevision=ap.organisationRevision AND json_extract(newer.evidence,'$.sharedRevision') IS json_extract(ap.evidence,'$.sharedRevision') AND newer.occupancyRevisionId IS ap.occupancyRevisionId AND newer.addressRevisionId IS ap.addressRevisionId)
      AND NOT EXISTS (SELECT 1 FROM locationAdoptionProposal older
        WHERE older.featureId=ap.featureId AND older.projectId=ap.projectId
          AND older.locationId=ap.locationId AND older.candidateRevisionId=ap.candidateRevisionId AND older.organisationRevision=ap.organisationRevision AND json_extract(older.evidence,'$.sharedRevision') IS json_extract(ap.evidence,'$.sharedRevision') AND older.occupancyRevisionId IS ap.occupancyRevisionId AND older.addressRevisionId IS ap.addressRevisionId
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
export async function proposeLatestLocalLocationAdoption(
  db: Database,
  input: { featureId: string; projectId: string },
): Promise<{ proposal: Proposal; decisions: Decision[] } | null> {
  const association = await db
    .select({
      locationId: featureLocation.locationId,
      organisationId: sql<string>`(SELECT organisationId FROM project WHERE id=${input.projectId})`,
    })
    .from(featureLocation)
    .innerJoin(feature, eq(feature.id, featureLocation.featureId))
    .where(and(eq(feature.id, input.featureId), eq(feature.projectId, input.projectId)))
    .get()
  if (!association) return null
  const correction = await readOrganisationLocation(
    db,
    association.organisationId,
    association.locationId,
  )
  const latest = await db
    .select({ id: locationRevision.id })
    .from(locationRevision)
    .where(eq(locationRevision.locationId, association.locationId))
    .orderBy(sql`version DESC`)
    .get()
  if (!latest) return null
  return proposeFeatureLocationAdoption(db, {
    ...input,
    candidateRevisionId: latest.id,
    organisationRevision: correction?.revision,
  })
}
