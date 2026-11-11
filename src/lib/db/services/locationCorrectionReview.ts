import { locationCorrectionMerge } from '../schema/locationCorrectionProposal'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
import type { LocationHistoryAction } from '#lib/revisions/locationActions.js'
import { prepareSharedFeatureAdoption } from './locationSharedFeature'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  SHARED_CONTACT_FIELDS,
  type SharedCorrectionPatch,
} from '#lib/locations/sharedCorrection.js'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureLocation } from '../schema/location'
import {
  locationCorrectionProposal,
  locationCorrectionDecision,
} from '../schema/locationCorrectionProposal'
// DOMAIN
import { LocationCorrectionPatchSchema } from '#lib/locations/correctionProposal.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
// SERVICES
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { readLocationResetSources } from './locationReset'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
import type { LocationCorrectionPatch } from '#lib/locations/correctionProposal.js'

type LocationCorrectionContext = {
  association: typeof featureLocation.$inferSelect
  sources: NonNullable<Awaited<ReturnType<typeof readLocationResetSources>>>
  overrides: FeatureLocationOverrides
  effective: ReturnType<typeof resolveFeatureLocation>
  expectedOrganisationRevision: string | null
  unchanged: SQL
}

type Scope = {
  featureId: string
  projectId: string
  organisationId: string
  guard: SQL
}

// TABLE OF CONTENTS
// 1. Current shared correction context
// 2. Independent proposal submission
// 3. Field-authorized staff review

/**
 * Captures current shared correction evidence independently of the Feature's accepted projection.
 * @param db Request database.
 * @param input Persisted, authorized Feature ancestry.
 * @returns Shared display values, immutable source references and a transactional equality guard.
 * @remarks Reading is non-mutating; authorized acceptance adopts changes into the originating Feature.
 */
export async function readLocationCorrectionContext(
  db: Database,
  input: Scope,
): Promise<LocationCorrectionContext | null> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='locationCorrectionProposal' AND type='table'`,
  )
  if (!storage?.n) return null
  const association = await db
    .select()
    .from(featureLocation)
    .where(and(eq(featureLocation.featureId, input.featureId), input.guard))
    .get()
  if (!association) return null
  const sources = await readLocationResetSources(db, {
    ...association,
    projectId: input.projectId,
  })
  if (!sources) return null
  const head = await readOrganisationLocation(
    db,
    input.organisationId,
    association.locationId,
  )
  const overrides = head?.overrides ?? {}
  const effective = resolveFeatureLocation(
    sources.facts,
    sources.locationFacts.location,
    overrides,
  )
  const expectedOrganisationRevision = head?.revision ?? null
  const unchanged = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
    JOIN location l ON l.id=fl.locationId WHERE f.id=${input.featureId} AND f.projectId=${input.projectId}
      AND f.organisationId=${input.organisationId} AND f.isArchived=0 AND fl.locationId=${association.locationId}
      AND fl.version=${association.version} AND fl.factsRevisionId=${association.factsRevisionId}
      AND fl.locationRevisionId=${association.locationRevisionId} AND l.state!='redirect'
      AND (l.state!='manual' OR l.ownerOrganisationId=${input.organisationId}))
    AND (SELECT revision FROM organisationLocationHead WHERE organisationId=${input.organisationId}
      AND locationId=${association.locationId}) IS ${expectedOrganisationRevision}`
  return {
    association,
    sources,
    overrides,
    effective,
    expectedOrganisationRevision,
    unchanged,
  }
}

/**
 * Submits immutable shared choices for separate review without changing any accepted records.
 * @param db Request database.
 * @param input Authorized contributor, exact displayed association/shared head, reason and limited patch.
 * @returns Proposal identity, or null if either displayed revision changed.
 */
export async function proposeLocationCorrection(
  db: Database,
  input: Scope & {
    actorId: string
    reason: string
    expectedAssociationVersion: string
    expectedOrganisationRevision: string | null
    patch: LocationCorrectionPatch
  },
): Promise<string | null> {
  const context = await readLocationCorrectionContext(db, input)
  if (
    !context ||
    context.association.version !== input.expectedAssociationVersion ||
    context.expectedOrganisationRevision !== input.expectedOrganisationRevision
  )
    return null
  const patch = LocationCorrectionPatchSchema.parse(input.patch)
  const after: FeatureLocationOverrides = {
    ...context.overrides,
    ...patch,
    ...(patch.names ? { names: { ...context.overrides.names, ...patch.names } } : {}),
  }
  if (equalLocationValue(context.overrides, after))
    throw new Error('No shared correction changed')
  const resulting = resolveFeatureLocation(
    context.sources.facts,
    context.sources.locationFacts.location,
    after,
  )
  const beforeValues = {
    names: context.effective.names,
    phoneNumber: context.effective.phoneNumber,
    brands: context.effective.brands,
    websites: context.effective.websites,
    socials: context.effective.socials,
    accessibility: context.effective.accessibility,
    location: context.effective.location,
  }
  const afterValues = {
    names: resulting.names,
    phoneNumber: resulting.phoneNumber,
    brands: resulting.brands,
    websites: resulting.websites,
    socials: resulting.socials,
    accessibility: resulting.accessibility,
    location: resulting.location,
  }
  const id = crypto.randomUUID()
  return (await executeRevisionBatch(db, context.unchanged, [
    db.insert(locationCorrectionProposal).values({
      id,
      featureId: input.featureId,
      organisationId: input.organisationId,
      locationId: context.association.locationId,
      associationVersion: context.association.version,
      factsRevisionId: context.association.factsRevisionId,
      locationRevisionId: context.association.locationRevisionId,
      expectedOrganisationRevision: context.expectedOrganisationRevision,
      beforeOverrides: context.overrides,
      afterOverrides: after,
      beforeValues,
      afterValues,
      patch,
      actorId: input.actorId,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    }),
  ]))
    ? id
    : null
}

/**
 * Records a separately authorized Organisation correction decision with its exact resulting revision.
 * @param db Request database.
 * @param input Current Organisation reviewer scope and selected immutable proposal.
 * @returns True on atomic decision, false for stale or already-decided evidence.
 * @remarks Concurrent shared edits require a fresh proposal; no overwrite or implicit Feature acceptance.
 * Rejection remains possible after source drift, but always under current ancestry and permission.
 */
export async function decideLocationCorrection(
  db: Database,
  input: Scope & {
    proposalId: string
    actorId: string
    outcome: 'accepted' | 'rejected'
    selectedFields?: string[]
    reason: string
    sharedRights?: { canEdit: boolean; superAdmin: boolean }
    canEditOrganisation?: boolean
  },
): Promise<boolean> {
  const proposal = await db
    .select()
    .from(locationCorrectionProposal)
    .where(
      and(
        eq(locationCorrectionProposal.id, input.proposalId),
        eq(locationCorrectionProposal.featureId, input.featureId),
        eq(locationCorrectionProposal.organisationId, input.organisationId),
        input.guard,
      ),
    )
    .get()
  if (!proposal) return false
  const pending = sql`(${input.guard}) AND NOT EXISTS (SELECT 1 FROM locationCorrectionDecision WHERE proposalId=${proposal.id})`
  const decision = {
    proposalId: proposal.id,
    actorId: input.actorId,
    outcome: input.outcome,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  }
  if (input.outcome === 'rejected')
    return Boolean(
      await executeRevisionBatch(db, pending, [
        db
          .insert(locationCorrectionDecision)
          .values({ ...decision, organisationRevision: null }),
      ]),
    )
  const context = await readLocationCorrectionContext(db, input)
  if (
    !context ||
    context.association.version !== proposal.associationVersion ||
    context.association.locationId !== proposal.locationId ||
    context.expectedOrganisationRevision !== proposal.expectedOrganisationRevision
  )
    return false
  const originalPatch = LocationCorrectionPatchSchema.parse(proposal.patch)
  const fields = input.selectedFields ?? Object.keys(originalPatch)
  if (
    !fields.length ||
    new Set(fields).size !== fields.length ||
    fields.some(field => !Object.hasOwn(originalPatch, field))
  )
    throw new Error('INVALID_CORRECTION_SELECTION')
  const selectedPatch = LocationCorrectionPatchSchema.parse(
    Object.fromEntries(
      fields.map(field => [field, originalPatch[field as keyof typeof originalPatch]]),
    ),
  )
  // Task review routes contact proposals to Hype and sensitive fields to Organisation overrides.
  const writes = await prepareRoutedLocationCorrection(db, {
    ...input,
    context,
    patch: selectedPatch,
    sharedRights: input.sharedRights ?? { canEdit: false, superAdmin: false },
    canEditOrganisation: input.canEditOrganisation ?? true,
    proposalCreatedAt: proposal.createdAt,
    action: 'contribution-accepted',
    provenance: {
      kind: 'task-correction',
      proposalId: proposal.id,
      contributorId: proposal.actorId,
      featureId: input.featureId,
    },
  })
  return Boolean(
    await executeRevisionBatch(db, and(pending, context.unchanged)!, [
      ...writes.queries,
      ...(input.selectedFields
        ? [
            db.insert(locationCorrectionMerge).values({
              proposalId: proposal.id,
              patch: selectedPatch,
              actorId: input.actorId,
              createdAt: decision.createdAt,
            }),
          ]
        : []),
      db
        .insert(locationCorrectionDecision)
        .values({ ...decision, organisationRevision: writes.organisationRevision }),
    ]),
  )
}

/**
 * Saves an authorized staff correction to its field-owned layer.
 * @param db Request database.
 * @param input Separately authorized Organisation edit and exact displayed shared revisions.
 * @returns Accepted Organisation revision, or null on stale input.
 * @remarks Adopts the accepted fields into the originating Feature atomically; other Features retain their policies.
 */
export async function applyLocationCorrection(
  db: Database,
  input: Scope & {
    actorId: string
    reason: string
    expectedAssociationVersion: string
    expectedOrganisationRevision: string | null
    patch: LocationCorrectionPatch
    sharedRights?: { canEdit: boolean; superAdmin: boolean }
    canEditOrganisation?: boolean
  },
): Promise<string | null> {
  const context = await readLocationCorrectionContext(db, input)
  if (
    !context ||
    context.association.version !== input.expectedAssociationVersion ||
    context.expectedOrganisationRevision !== input.expectedOrganisationRevision
  )
    return null
  const writes = await prepareRoutedLocationCorrection(db, {
    ...input,
    context,
    sharedRights: input.sharedRights ?? { canEdit: false, superAdmin: false },
    canEditOrganisation: input.canEditOrganisation ?? true,
    action: 'staff-update',
    provenance: {
      kind: 'staff-correction',
      featureId: input.featureId,
      reason: input.reason,
    },
  })
  const saved = await executeRevisionBatch(db, context.unchanged, writes.queries)
  return saved ? (writes.sharedRevision ?? writes.organisationRevision) : null
}

/** Prepare field-owned corrections and immediate originating Feature adoption for staff or task acceptance.
 * @param db Database. @param input Authorized ancestry, reviewer rights, immutable proposal and current evidence.
 * @returns All correction/history statements for one transaction.
 */
async function prepareRoutedLocationCorrection(
  db: Database,
  input: Scope & {
    actorId: string
    patch: LocationCorrectionPatch
    context: LocationCorrectionContext
    sharedRights: { canEdit: boolean; superAdmin: boolean }
    canEditOrganisation: boolean
    action: LocationHistoryAction
    provenance: Record<string, unknown>
    proposalCreatedAt?: string
  },
) {
  const patch = LocationCorrectionPatchSchema.parse(input.patch)
  const sharedPatch: SharedCorrectionPatch = {}
  const organisationPatch = { ...patch }
  for (const field of SHARED_CONTACT_FIELDS) {
    if (field in patch) {
      Object.assign(sharedPatch, { [field]: patch[field as keyof typeof patch] })
      delete (organisationPatch as Record<string, unknown>)[field]
    }
  }
  if (Object.keys(organisationPatch).length && !input.canEditOrganisation)
    throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
  const context = input.context
  const latest = await db.get<{ id: string; facts: string }>(
    sql`SELECT id,facts FROM locationRevision WHERE locationId=${context.association.locationId} ORDER BY version DESC LIMIT 1`,
  )
  if (!latest) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
  const head = await readSharedLocationCorrection(db, context.association.locationId)
  if (input.proposalCreatedAt && head && head.createdAt > input.proposalCreatedAt)
    throw new Error('SHARED_LOCATION_CHANGED')
  const shared = Object.keys(sharedPatch).length
    ? await prepareSharedLocationCorrection(db, {
        locationId: context.association.locationId,
        sourceRevisionId: latest.id,
        expectedRevision: head?.id ?? null,
        actorId: input.actorId,
        guard: context.unchanged,
        patch: sharedPatch,
        rights: input.sharedRights,
        provenance: input.provenance,
      })
    : null
  const overrides: FeatureLocationOverrides = {
    ...context.overrides,
    ...organisationPatch,
    ...(organisationPatch.names
      ? { names: { ...context.overrides.names, ...organisationPatch.names } }
      : {}),
  }
  const organisation = await prepareOrganisationLocationWrite(db, {
    organisationId: input.organisationId,
    locationId: context.association.locationId,
    actorId: input.actorId,
    overrides,
    guard: context.unchanged,
    provenance: input.provenance,
  })
  const adoption = await prepareSharedFeatureAdoption(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    actorId: input.actorId,
    locationId: context.association.locationId,
    action: input.action,
    sourceRevisionId: latest.id,
    sharedRevisionId: shared?.id ?? head?.id ?? null,
    facts: shared?.facts ?? readLocationFacts(latest.facts),
    fields: Object.keys(patch),
    includeLocation: Boolean(patch.location),
    organisation: { revision: organisation.revision, overrides },
    guard: context.unchanged,
  })
  return {
    sharedRevision: shared?.id,
    organisationRevision: organisation.revision,
    queries: [
      ...(shared?.queries ?? []),
      ...organisation.queries,
      prepareRevisionCheck(db, organisation.guard),
      ...(adoption
        ? [prepareRevisionCheck(db, adoption.guard), ...adoption.statements]
        : []),
    ],
  }
}
