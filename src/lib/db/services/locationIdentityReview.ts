// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. AUTHORIZATION PROBE
// - probeLocationIdentityScope
// 2. REVIEW EVIDENCE
// - readLocationIdentityBaseline
// - captureLocationIdentityReview
// - captureMirroredLocationIdentityReview
// - readLocationIdentityReview
// 3. REVIEW ACCEPTANCE
// - acceptLocationIdentityReview
// ---
// DRIZZLE
import { and, eq, isNull, or, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import {
  location as locationTable,
  locationIdentityReview,
  locationRevision,
} from '../schema/location'
// DOMAIN
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
// SERVICES
import { acceptLocationIdentity } from './locationIdentity'
import { locationRematchReviewGuard } from './locationRematchGuard'
import { prepareSaanSeoiRevision } from './locationSource'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'
import type { LocationIdentityBaseline } from '#lib/locations/identity.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

// ---
/********************
 *  1. AUTHORIZATION PROBE
 ************/
// +++ Authorization Probe
/**
 * Read only the persisted ownership needed to authorize Location identity administration.
 * @param db Request-local database.
 * @param locationId Stable HYPE identity.
 * @returns Minimal scope or null, never source facts or raw provenance.
 */
export async function probeLocationIdentityScope(
  db: Database,
  locationId: string,
): Promise<{
  id: string
  ownerOrganisationId: string | null
  state: 'linked' | 'manual' | 'unresolved' | 'redirect'
  ssId: string | null
} | null> {
  return (
    (await db
      .select({
        id: locationTable.id,
        state: locationTable.state,
        ssId: locationTable.ssId,
        ownerOrganisationId: locationTable.ownerOrganisationId,
      })
      .from(locationTable)
      .where(eq(locationTable.id, locationId))
      .get()) ?? null
  )
}

// ---
/********************
 *  2. REVIEW EVIDENCE
 ************/
// +++ Review Evidence
/**
 * Capture the current identity and source-revision concurrency baseline.
 * @param db Request-local database.
 * @param locationId Authorized Location identity.
 * @param ownerOrganisationId Ownership checked by the authorization probe, including null for shared.
 * @returns Baseline tokens or null if ownership/identity disappeared.
 * @remarks One SQL statement captures the latest revision and history tail together.
 */
export async function readLocationIdentityBaseline(
  db: Database,
  locationId: string,
  ownerOrganisationId: string | null,
): Promise<LocationIdentityBaseline | null> {
  const row = await db
    .select({
      locationId: locationTable.id,
      expectedState: locationTable.state,
      expectedSsId: locationTable.ssId,
      expectedOwnerOrganisationId: locationTable.ownerOrganisationId,
      expectedSourceAvailability: locationTable.sourceAvailability,
      expectedLatestRevisionId: locationRevision.id,
      expectedHistoryId: sql<string | null>`(SELECT h.id FROM locationIdentityHistory h
      WHERE h.locationId=${locationTable.id} AND NOT EXISTS
      (SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))`,
    })
    .from(locationTable)
    .innerJoin(locationRevision, eq(locationRevision.locationId, locationTable.id))
    .where(
      and(
        eq(locationTable.id, locationId),
        sql`${locationTable.ownerOrganisationId} IS ${ownerOrganisationId}`,
        sql`${locationRevision.version}=(SELECT max(r.version) FROM locationRevisionContent r WHERE r.locationId=${locationTable.id})`,
      ),
    )
    .get()
  if (!row || row.expectedState === 'redirect') return null
  return { ...row, expectedState: row.expectedState }
}

/**
 * Retain server-verified canonical evidence without claiming the candidate's source identity.
 * @param db Request-local database.
 * @param baseline Authorized target state captured before fetching source evidence.
 * @param projection Verified pinned collection record, never supplied by a remote client.
 * @param actorId Authenticated reviewer starting the comparison.
 * @returns Immutable review ID or null when the target changed during source retrieval.
 */
export async function captureLocationIdentityReview(
  db: Database,
  baseline: LocationIdentityBaseline,
  projection: SaanSeoiPlaceProjection,
  actorId: string,
): Promise<string | null> {
  if (!actorId.trim()) throw new Error('Identity review requires an actor')
  await prepareSaanSeoiRevision(baseline.locationId, projection)
  const current = await readLocationIdentityBaseline(
    db,
    baseline.locationId,
    baseline.expectedOwnerOrganisationId,
  )
  if (!equalLocationValue(current, baseline)) return null
  const id = nanoid(24)
  // Capture cannot race an identity, ownership or source-revision change after the fetch.
  const rows = await db
    .insert(locationIdentityReview)
    .select(sql`SELECT ${id},${baseline.locationId},
    ${baseline.expectedOwnerOrganisationId},${JSON.stringify(baseline)},${JSON.stringify(projection)},
    ${actorId},'[]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS
    (SELECT 1 FROM location WHERE id=${baseline.locationId} AND ownerOrganisationId IS ${baseline.expectedOwnerOrganisationId}
      AND state=${baseline.expectedState} AND ssId IS ${baseline.expectedSsId}
      AND sourceAvailability=${baseline.expectedSourceAvailability})
    AND (SELECT id FROM locationRevisionContent AS locationRevision WHERE locationId=${baseline.locationId} ORDER BY version DESC LIMIT 1)
      =${baseline.expectedLatestRevisionId}
    AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=${baseline.locationId}
      AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))
      IS ${baseline.expectedHistoryId}`)
    .returning({ id: locationIdentityReview.id })
  return rows[0]?.id ?? null
}

/**
 * Capture a canonical revision already mirrored in HYPE for the editor's selected candidate.
 * @param db Request-local database.
 * @param baseline Authorized target scope captured before resolving the candidate.
 * @param candidateRevisionId Exact selected source revision, not client-supplied facts.
 * @param actorId Authenticated reviewer.
 * @returns Retained review ID or null for inaccessible, obsolete-identity or changed input.
 * @remarks Only shared source evidence or evidence owned by the same project is eligible.
 * A candidate already bound to another Location remains subject to explicit merge handling.
 */
export async function captureMirroredLocationIdentityReview(
  db: Database,
  baseline: LocationIdentityBaseline,
  candidateRevisionId: string,
  actorId: string,
): Promise<string | null> {
  const row = await db
    .select({
      ssId: locationRevision.ssId,
      apiVersion: locationRevision.apiVersion,
      releaseId: locationRevision.releaseId,
      snapshotId: locationRevision.snapshotId,
      rawSource: locationRevision.rawSource,
      facts: locationRevision.facts,
    })
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationRevision.id, candidateRevisionId),
        eq(locationRevision.origin, 'saanseoi'),
        eq(locationTable.state, 'linked'),
        eq(locationTable.sourceAvailability, 'current'),
        eq(locationTable.ssId, locationRevision.ssId),
        or(
          isNull(locationTable.ownerOrganisationId),
          baseline.expectedOwnerOrganisationId
            ? eq(
                locationTable.ownerOrganisationId,
                baseline.expectedOwnerOrganisationId,
              )
            : sql`0`,
        ),
      ),
    )
    .get()
  if (!row?.ssId || !row.apiVersion || !row.releaseId || !row.snapshotId) return null
  const { issues: rawIssues, ...rawSource } = row.rawSource
  const issues = z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('invalidPhone'),
          index: z.number().int().nonnegative(),
          value: z.string(),
        }),
        z.object({ kind: z.literal('addressRecordsPending') }),
      ]),
    )
    .parse(rawIssues ?? [])
  return captureLocationIdentityReview(
    db,
    baseline,
    {
      ...row,
      ssId: row.ssId,
      apiVersion: row.apiVersion,
      releaseId: row.releaseId,
      snapshotId: row.snapshotId,
      rawSource,
      issues,
    },
    actorId,
  )
}

/**
 * Read the comparison shown to an authorized identity reviewer.
 * @param db Request-local database.
 * @param input Persisted target scope and immutable review identity.
 * @returns Projected before/after facts and source identifiers; raw rawSource stays server-side.
 * @remarks A stale review remains readable but cannot be accepted without recapturing evidence.
 */
export async function readLocationIdentityReview(
  db: Database,
  input: {
    locationId: string
    ownerOrganisationId: string | null
    reviewId: string
  },
): Promise<{
  id: string
  locationId: string
  stale: boolean
  previousSsId: string | null
  previousState: LocationIdentityBaseline['expectedState']
  before: LocationFacts
  candidate: {
    ssId: string
    releaseId: string
    snapshotId: string
    facts: LocationFacts
    issueKinds: SaanSeoiPlaceProjection['issues'][number]['kind'][]
  }
  createdAt: string
  rejected: boolean
  rematch?: {
    score: number
    distance: number
    numberConflict: boolean
    incomplete: boolean
  }
} | null> {
  const row = await db
    .select()
    .from(locationIdentityReview)
    .where(
      and(
        eq(locationIdentityReview.id, input.reviewId),
        eq(locationIdentityReview.locationId, input.locationId),
        sql`${locationIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
      ),
    )
    .get()
  if (!row) return null
  const current = await readLocationIdentityBaseline(
    db,
    input.locationId,
    input.ownerOrganisationId,
  )
  if (!current) return null
  const baseline = await db
    .select({ facts: locationRevision.facts })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.locationId, input.locationId),
        eq(locationRevision.id, row.baseline.expectedLatestRevisionId),
      ),
    )
    .get()
  if (!baseline) return null
  return {
    id: row.id,
    locationId: input.locationId,
    stale:
      !equalLocationValue(current, row.baseline) ||
      !(
        await db.get<{ valid: number }>(
          sql`SELECT ${locationRematchReviewGuard(row.id)} valid`,
        )
      ).valid,
    previousSsId: row.baseline.expectedSsId,
    previousState: row.baseline.expectedState,
    before: LocationFactsSchema.parse(baseline.facts),
    candidate: {
      ssId: row.projection.ssId,
      releaseId: row.projection.releaseId,
      snapshotId: row.projection.snapshotId,
      facts: LocationFactsSchema.parse(row.projection.facts),
      issueKinds: row.projection.issues.map(issue => issue.kind),
    },
    rejected: Boolean(
      await db.get(
        sql`SELECT 1 AS found FROM locationIdentityReview WHERE rejection IS NOT NULL AND id=${row.id}`,
      ),
    ),
    createdAt: row.createdAt,
    ...(() => {
      const metadata = z
        .object({
          evidence: z.object({
            score: z.number(),
            distance: z.number(),
            numberConflict: z.boolean(),
          }),
          incomplete: z.boolean(),
        })
        .safeParse(row.projection.rawSource.hypeRematch)
      return metadata.success
        ? {
            rematch: {
              ...metadata.data.evidence,
              incomplete: metadata.data.incomplete,
            },
          }
        : {}
    })(),
  }
}

// ---
/********************
 *  3. REVIEW ACCEPTANCE
 ************/
// +++ Review Acceptance
/**
 * Accept only the source evidence and target tokens retained in a server-created review.
 * @param db Request-local database.
 * @param input Reauthorized target scope, review ID, authenticated actor and recorded reason.
 * @returns Transition result or conflict; occupied source identities still require merge review.
 * @remarks Client-supplied source facts, state tokens or project scope are never accepted.
 */
export async function acceptLocationIdentityReview(
  db: Database,
  input: {
    locationId: string
    ownerOrganisationId: string | null
    reviewId: string
    actorId: string
    reason: string
  },
): Promise<Awaited<ReturnType<typeof acceptLocationIdentity>>> {
  const row = await db
    .select()
    .from(locationIdentityReview)
    .where(
      and(
        eq(locationIdentityReview.id, input.reviewId),
        sql`NOT EXISTS (SELECT 1 FROM locationIdentityReview WHERE rejection IS NOT NULL AND id=${input.reviewId})`,
        eq(locationIdentityReview.locationId, input.locationId),
        sql`${locationIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
      ),
    )
    .get()
  if (!row) return { status: 'conflict' }
  const current = await readLocationIdentityBaseline(
    db,
    input.locationId,
    input.ownerOrganisationId,
  )
  if (!equalLocationValue(current, row.baseline)) return { status: 'conflict' }
  if (
    !(
      await db.get<{ valid: number }>(
        sql`SELECT ${locationRematchReviewGuard(row.id)} valid`,
      )
    ).valid
  )
    return { status: 'conflict' }
  return acceptLocationIdentity(
    db,
    { ...row.baseline, reviewId: row.id, actorId: input.actorId, reason: input.reason },
    row.projection,
  )
}
