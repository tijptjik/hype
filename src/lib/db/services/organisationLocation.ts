// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import {
  organisationLocation,
  location as locationTable,
  locationRevision,
} from '../schema/location'
// DOMAIN
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { validateLocationStatusKind } from '#lib/locations/lifecycle.js'
import {
  FeatureLocationOverridesSchema,
  LocationFactsSchema,
} from '#lib/locations/validation.js'
import { applyFeatureLocationEdits } from '#lib/locations/edits.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import {
  equalLocationValue,
  preserveFeatureLocationBaseline,
} from '#lib/locations/baseline.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { FeatureLocationOverrides, LocationFacts } from '#lib/locations/model.js'
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SCOPED CORRECTION READS
// 2. ATOMIC BASELINE / CORRECTION WRITES
// ---

/** Read an Organisation's latest or retained correction snapshot.
 * @param db Request-local database.
 * @param organisationId Authorized Organisation identity.
 * @param locationId Shared or accessible manual Location.
 * @param revision Optional retained version; omission selects the current head.
 * @returns Validated correction version, or null when absent.
 */
export async function readOrganisationLocation(
  db: Database,
  organisationId: string,
  locationId: string,
  revision?: string | null,
): Promise<{ revision: string; overrides: FeatureLocationOverrides } | null> {
  const row = await db
    .select()
    .from(organisationLocation)
    .where(
      and(
        eq(organisationLocation.organisationId, organisationId),
        eq(organisationLocation.locationId, locationId),
      ),
    )
    .get()
  if (!row) return null
  const selected = revision ? row.history.find(item => item.revision === revision) : row
  return selected
    ? {
        revision: selected.revision,
        overrides: FeatureLocationOverridesSchema.parse(selected.overrides),
      }
    : null
}

/** Prepare an Organisation correction update behind an existing atomic Feature/owner fence.
 * @param db Request-local database.
 * @param input Persisted scope, actor, desired complete corrections and transaction guard.
 * @returns Conditional writes and the resulting immutable revision token.
 * @remarks History is append-only. Concurrent head changes make the entire caller's guarded write stale.
 */
export async function prepareOrganisationLocationWrite(
  db: Database,
  input: {
    organisationId: string
    locationId: string
    actorId: string
    overrides: FeatureLocationOverrides
    provenance?: Record<string, unknown>
    guard: SQL
  },
): Promise<{ queries: BatchItem<'sqlite'>[]; revision: string | null; guard: SQL }> {
  const current = await db
    .select()
    .from(organisationLocation)
    .where(
      and(
        eq(organisationLocation.organisationId, input.organisationId),
        eq(organisationLocation.locationId, input.locationId),
      ),
    )
    .get()
  const overrides = FeatureLocationOverridesSchema.parse(input.overrides)
  if (equalLocationValue(current?.overrides ?? {}, overrides))
    return {
      queries: [],
      revision: current?.revision ?? null,
      guard: current
        ? sql`EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId} AND revision=${current.revision})`
        : sql`NOT EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId})`,
    }
  const revision = nanoid(12),
    now = new Date().toISOString()
  const entry = {
    revision,
    overrides,
    actorId: input.actorId,
    createdAt: now,
    ...(input.provenance ? { provenance: input.provenance } : {}),
  }
  const headGuard = current
    ? sql`revision=${current.revision}`
    : sql`NOT EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId})`
  const queries: BatchItem<'sqlite'>[] = current
    ? [
        db
          .update(organisationLocation)
          .set({
            revision,
            overrides,
            history: [...current.history, entry],
            actorId: input.actorId,
            updatedAt: now,
          })
          .where(
            and(
              eq(organisationLocation.organisationId, input.organisationId),
              eq(organisationLocation.locationId, input.locationId),
              headGuard,
              input.guard,
            ),
          ),
      ]
    : [
        db
          .insert(organisationLocation)
          .select(
            sql`SELECT ${input.organisationId},${input.locationId},${revision},${JSON.stringify(overrides)},${JSON.stringify([entry])},${input.actorId},${now},${now} WHERE ${input.guard} AND ${headGuard}`,
          ),
      ]
  return {
    queries,
    revision,
    guard: sql`EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId} AND revision=${revision})`,
  }
}

/** Prepare the correct authoring scope for a physical-location edit.
 * @param db Request-local database.
 * @param input Authorized Organisation/Feature fence and before/after effective values.
 * @returns Baseline/correction writes, accepted snapshots and guarded revision identities.
 * @remarks Only an unmatched/manual owner edits the shared/private baseline. Every other
 * Organisation, including the former owner of a source-linked Location, writes its own corrections.
 */
export async function prepareLocationCorrection(
  db: Database,
  input: {
    organisationId: string
    locationId: string
    actorId: string
    before: EffectiveLocationFacts
    after: EffectiveLocationFacts
    currentOverrides: FeatureLocationOverrides
    reset?: boolean
    desiredOverrides?: FeatureLocationOverrides
    provenance?: Record<string, unknown>
    expectedBaselineRevisionId?: string
    expectedOrganisationRevision?: string | null
    guard: SQL
  },
): Promise<{
  queries: BatchItem<'sqlite'>[]
  overrides: FeatureLocationOverrides
  organisationRevision: string | null
  baselineRevision?: { id: string; facts: LocationFacts }
  guard: SQL
}> {
  const owner = await db
    .select()
    .from(locationTable)
    .where(eq(locationTable.id, input.locationId))
    .get()
  if (
    !owner ||
    owner.state === 'redirect' ||
    (owner.state === 'manual' && owner.ownerOrganisationId !== input.organisationId)
  )
    throw new Error('Location unavailable')
  validateLocationStatusKind(owner.kind, input.after)
  // An explicit successor must exist in the caller's visible scope; never expose a private ID.
  if (input.after.successorLocationId) {
    if (input.after.successorLocationId === input.locationId)
      throw new Error('A Location cannot succeed itself')
    const successor = await db
      .select()
      .from(locationTable)
      .where(
        and(
          eq(locationTable.id, input.after.successorLocationId),
          sql`${locationTable.state}!='redirect'`,
          sql`(${locationTable.state}!='manual' OR ${locationTable.ownerOrganisationId}=${input.organisationId})`,
        ),
      )
      .get()
    if (!successor || (owner.state !== 'manual' && successor.state === 'manual'))
      throw new Error('Successor Location unavailable')
  }
  const head = await readOrganisationLocation(
    db,
    input.organisationId,
    input.locationId,
  )
  if (
    input.expectedOrganisationRevision !== undefined &&
    input.expectedOrganisationRevision !== (head?.revision ?? null)
  )
    throw new Error('Stale Organisation Location correction')
  let overrides = applyFeatureLocationEdits(
    head?.overrides ?? input.currentOverrides,
    input.before,
    input.after,
  )
  // Explicit resets remove an Organisation correction rather than freezing the inherited value.
  if (input.desiredOverrides) {
    for (const [key, value] of Object.entries(input.desiredOverrides)) {
      if (key === 'names') {
        for (const [locale, choice] of Object.entries(value ?? {}))
          if ((choice as { mode: string }).mode === 'inherit') {
            overrides.names ??= {}
            overrides.names[locale] = { mode: 'inherit' }
          }
      } else if (value && 'mode' in value && value.mode === 'inherit')
        Object.assign(overrides, { [key]: { mode: 'inherit' } })
    }
  }
  let baselineRevision: { id: string; facts: LocationFacts } | undefined
  const queries: BatchItem<'sqlite'>[] = []
  // Recheck successor visibility in the write batch: a concurrent redirect/scope change must make the whole edit stale.
  const successorGuard = input.after.successorLocationId
    ? sql`EXISTS(SELECT 1 FROM location successor WHERE successor.id=${input.after.successorLocationId}
        AND successor.state!='redirect' AND (successor.state!='manual' OR successor.ownerOrganisationId=${input.organisationId})
        AND (${Number(owner.state === 'manual')} OR successor.state!='manual'))`
    : sql`1`
  const authoringGuard = sql`(${input.guard}) AND ${successorGuard}`
  let guard = authoringGuard
  // Ownership controls baseline authority, independently of shared unmatched visibility.
  if (
    !input.reset &&
    !equalLocationValue(input.before, input.after) &&
    owner.ssId === null &&
    owner.ownerOrganisationId === input.organisationId
  ) {
    const baseline = await db
      .select()
      .from(locationRevision)
      .where(eq(locationRevision.locationId, input.locationId))
      .orderBy(sql`sequence DESC`)
      .get()
    if (
      !baseline ||
      (input.expectedBaselineRevisionId &&
        baseline.id !== input.expectedBaselineRevisionId)
    )
      throw new Error('Location baseline unavailable or stale')
    const delta = applyFeatureLocationEdits({}, input.before, input.after)
    const value = resolveFeatureLocation(baseline.facts, baseline.facts.location, delta)
    const facts = LocationFactsSchema.parse({
      ...value,
      names: Object.fromEntries(
        Object.entries(value.names).filter(([, v]) => v !== null),
      ),
      phoneNumber: value.phoneNumber ?? [],
      brands: value.brands ?? [],
    })
    const id = nanoid(12)
    const payload = {
      kind: 'organisation-baseline-edit',
      actorId: input.actorId,
      organisationId: input.organisationId,
      previousRevisionId: baseline.id,
      ...(input.provenance ? { provenance: input.provenance } : {}),
    }
    const predecessor = sql`EXISTS(SELECT 1 FROM location p JOIN locationRevision r ON r.locationId=p.id WHERE p.id=${input.locationId} AND p.ssId IS NULL AND p.state IN ('manual','unresolved') AND p.ownerOrganisationId=${input.organisationId} AND r.id=${baseline.id} AND r.sequence=(SELECT max(sequence) FROM locationRevision WHERE locationId=p.id)) AND ${head ? sql`EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId} AND revision=${head.revision})` : sql`NOT EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.organisationId} AND locationId=${input.locationId})`}`
    queries.push(
      db
        .insert(locationRevision)
        .select(
          sql`SELECT ${id},${input.locationId},${baseline.sequence + 1},'local',NULL,NULL,NULL,NULL,${id},${JSON.stringify(payload)},${serializeLocationFacts(facts, owner.kind)},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${authoringGuard} AND ${predecessor}`,
        ),
    )
    baselineRevision = { id, facts }
    guard = sql`${authoringGuard} AND EXISTS(SELECT 1 FROM locationRevision WHERE id=${id})`
    // Preserve pre-existing local differences while moving the edited fields into the owner's baseline.
    overrides = preserveFeatureLocationBaseline(input.after, facts, facts.location)
  }
  const correction = await prepareOrganisationLocationWrite(db, {
    ...input,
    overrides,
    guard,
  })
  return {
    queries: [...queries, ...correction.queries],
    overrides,
    organisationRevision: correction.revision,
    baselineRevision,
    guard: sql`${guard} AND ${correction.guard}`,
  }
}
