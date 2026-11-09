import { sharedLocationEditRights } from './services/locationOwnership'
// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery, guardedCommand } from './server/guarded'
import {
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
  authorizeOrganisationUpdateForSubmission,
} from './services/authz'
import { requireLocationOrganisationManager } from './services/locationOwnership'
// SERVICES
import { probeFeatureQuery, probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import {
  readLocationCorrectionContext,
  proposeLocationCorrection,
  decideLocationCorrection,
  applyLocationCorrection,
} from '#lib/db/services/locationCorrectionReview.js'
// DOMAIN
import { LocationCorrectionPatchSchema } from '#lib/locations/correctionProposal.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'

// TABLE OF CONTENTS
// 1. Current authority
// 2. Separate correction workspace
// 3. Submission and review decisions

const identity = z.object({
  featureId: z.string().min(1),
  meta: z.object({ isAdminRequest: z.boolean().optional() }).optional(),
})

/**
 * Resolves current Feature ancestry and field-edit authority for a shared correction request.
 * @param ctx Authenticated request context.
 * @param featureId Requested Feature; the caller cannot choose its Organisation.
 * @param substantive Whether the patch contains phones or brands, beyond translated names.
 * @returns Persisted scope, SQL fence and separate Organisation-review capability.
 */
async function scope(ctx: GuardedBaseContext, featureId: string, substantive = false) {
  const probe = await probeFeatureForUpdate(ctx.db, featureId)
  if (!probe) error(404, 'FEATURE_NOT_FOUND')
  const decision = authorizeFeatureUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: substantive ? { properties: true } : { i18n: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  const owner = await probeOrganisationQuery(ctx.db, {
    ref: probe.organisationId,
    refKey: 'id',
  })
  const canReview = Boolean(
    owner &&
      authorizeOrganisationUpdateForSubmission({
        user: ctx.user,
        userRoles: ctx.userRoles,
        resource: owner,
        submittedData: { code: true },
      }).allowed,
  )
  const canEditFacts = authorizeFeatureUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: { properties: true },
  }).allowed
  return {
    featureId,
    organisationId: probe.organisationId,
    projectId: probe.projectId,
    guard: buildFeatureCommandScopeGuard(ctx.db, featureId, probe),
    canReview,
    canEditFacts,
  }
}

/**
 * Reads current shared values and a bounded queue with distinct contributor and reviewer attribution.
 * @param input Feature identity.
 * @returns Safe editable values and before/after proposal evidence, without raw publisher payloads.
 */
export const getLocationCorrectionWorkspace = guardedQuery(
  identity,
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const sharedRights = await sharedLocationEditRights(ctx, command.projectId)
    const context = await readLocationCorrectionContext(ctx.db, command)
    if (!context) return null
    const rows = await ctx.db.all<{
      id: string
      patch: string
      acceptedPatch: string | null
      beforeValues: string
      afterValues: string
      actorId: string
      reason: string
      createdAt: string
      outcome: 'accepted' | 'rejected' | null
      reviewerId: string | null
    }>(sql`
    SELECT p.id,p.patch,m.patch acceptedPatch,p.beforeValues,p.afterValues,p.actorId,p.reason,p.createdAt,d.outcome,d.actorId reviewerId
    FROM locationCorrectionProposal p LEFT JOIN locationCorrectionDecision d ON d.proposalId=p.id LEFT JOIN locationCorrectionMerge m ON m.proposalId=p.id
    WHERE p.featureId=${input.featureId} AND p.organisationId=${command.organisationId}
      AND p.locationId=${context.association.locationId} AND (${Number(command.canReview || sharedRights.canEdit)} OR p.actorId=${ctx.user.id})
      AND (${command.guard}) ORDER BY p.createdAt DESC,p.id DESC LIMIT 50`)
    /** Exposes only the shared fields this panel edits. @param overrides Stored server snapshot. @returns Safe display fields. */
    const display = (overrides: FeatureLocationOverrides) => {
      const result = resolveFeatureLocation(
        context.sources.facts,
        context.sources.locationFacts.location,
        overrides,
      )
      return {
        names: result.names,
        phoneNumber: result.phoneNumber ?? [],
        brands: result.brands ?? [],
        websites: result.websites,
        socials: result.socials,
        accessibility: result.accessibility,
        location: result.location,
      }
    }
    const valuesSchema = z.object({
      websites: LocationFactsSchema.shape.websites,
      socials: LocationFactsSchema.shape.socials,
      accessibility: LocationFactsSchema.shape.accessibility,
      location: LocationFactsSchema.shape.location.nullable().optional(),
      names: z.record(z.string(), z.string().nullable()),
      phoneNumber: z
        .array(z.string())
        .nullable()
        .transform(value => value ?? []),
      brands: LocationFactsSchema.shape.brands
        .nullable()
        .transform(value => value ?? []),
    })
    return {
      locationId: context.association.locationId,
      version: context.association.version,
      organisationRevision: context.expectedOrganisationRevision,
      freshness: context.overrides.freshness ?? {},
      current: display(context.overrides),
      canReview: command.canReview || sharedRights.canEdit,
      canEditOrganisation: command.canReview,
      canEditSharedContacts: sharedRights.canEdit || sharedRights.superAdmin,
      canEditFacts: command.canEditFacts,
      proposals: rows.map(row => ({
        id: row.id,
        patch: LocationCorrectionPatchSchema.parse(JSON.parse(row.patch)),
        acceptedFields: row.acceptedPatch
          ? Object.keys(JSON.parse(row.acceptedPatch))
          : null,
        before: valuesSchema.parse(JSON.parse(row.beforeValues)),
        after: valuesSchema.parse(JSON.parse(row.afterValues)),
        actorId: row.actorId,
        reason: row.reason,
        createdAt: row.createdAt,
        outcome: row.outcome,
        reviewerId: row.reviewerId,
      })),
    }
  },
)

/**
 * Submits shared choices without publishing a Feature or changing its Location.
 * @param input Displayed shared revisions, limited field patch and contributor reason.
 * @returns Accepted shared revision for an Organisation manager, otherwise a correction proposal identity.
 */
export const submitLocationCorrection = guardedCommand(
  identity.extend({
    expectedAssociationVersion: z.string().min(1),
    expectedOrganisationRevision: z.string().nullable(),
    patch: LocationCorrectionPatchSchema,
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const command = await scope(
      ctx,
      input.featureId,
      Boolean(input.patch.brands || input.patch.phoneNumber),
    )
    // Shared-resource editors save directly; Feature-only authority cannot approve Organisation changes.
    const sharedRights = await sharedLocationEditRights(ctx, command.projectId)
    const needsOrganisation = Boolean(
      input.patch.names || input.patch.brands || input.patch.location,
    )
    if ((!needsOrganisation && sharedRights.canEdit) || command.canReview) {
      if (needsOrganisation)
        await requireLocationOrganisationManager(ctx, command.organisationId)
      const revisionId = await applyLocationCorrection(ctx.db, {
        ...input,
        ...command,
        actorId: ctx.user.id,
        sharedRights,
        canEditOrganisation: command.canReview,
      })
      if (!revisionId) error(409, 'LOCATION_CORRECTION_CHANGED')
      return { revisionId, status: 'accepted' as const }
    }
    const id = await proposeLocationCorrection(ctx.db, {
      ...input,
      ...command,
      actorId: ctx.user.id,
    })
    if (!id) error(409, 'LOCATION_CORRECTION_CHANGED')
    return { id, status: 'submitted' as const }
  },
)

/**
 * Approves or rejects a separately reviewed shared correction with Organisation authority.
 * @param input Selected correction and explicit decision reason.
 * @returns Decision acknowledgement; Feature adoption remains a separate review/policy operation.
 */
export const reviewLocationCorrection = guardedCommand(
  identity.extend({
    proposalId: z.string().min(1),
    outcome: z.enum(['accepted', 'rejected']),
    selectedFields: z
      .array(
        z.enum([
          'names',
          'phoneNumber',
          'brands',
          'location',
          'websites',
          'socials',
          'accessibility',
        ]),
      )
      .min(1)
      .max(7)
      .optional(),
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const sharedRights = await sharedLocationEditRights(ctx, command.projectId)
    if (!sharedRights.canEdit && !command.canReview) error(403, 'INSUFFICIENT_ROLE')
    if (
      !(await decideLocationCorrection(ctx.db, {
        ...input,
        ...command,
        actorId: ctx.user.id,
        sharedRights,
        canEditOrganisation: command.canReview,
      }))
    )
      error(409, 'LOCATION_CORRECTION_CHANGED')
    return { outcome: input.outcome }
  },
)

/** Scope third-party proposals through normal Feature visibility without granting edit authority.
 * @param ctx Authenticated contributor. @param featureId Existing readable Feature.
 * @returns Persisted proposal scope, fenced against parent and visibility changes.
 */
async function contributionScope(ctx: GuardedBaseContext, featureId: string) {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const probe = await probeFeatureQuery(ctx.db, { ref: featureId, refKey: 'id' })
  if (
    !probe ||
    !authorizeFeatureReadForProbe({ user: ctx.user, userRoles: ctx.userRoles, probe })
      .allowed
  )
    error(404, 'FEATURE_NOT_FOUND')
  const write = await probeFeatureForUpdate(ctx.db, featureId)
  if (!write) error(404, 'FEATURE_NOT_FOUND')
  return {
    featureId,
    projectId: write.projectId,
    organisationId: write.organisationId,
    guard: buildFeatureCommandScopeGuard(ctx.db, featureId, write),
  }
}

/** Read the revision tokens for a third-party correction proposal; no accepted state changes.
 * @param input Readable Feature. @returns Displayed facts and immutable proposal baseline.
 */
export const getLocationProposalContext = guardedQuery(identity, async (input, ctx) => {
  const scope = await contributionScope(ctx, input.featureId)
  const context = await readLocationCorrectionContext(ctx.db, scope)
  if (!context) error(404, 'LOCATION_NOT_FOUND')
  return {
    associationVersion: context.association.version,
    organisationRevision: context.expectedOrganisationRevision,
    values: context.effective,
  }
})

/** Submit third-party evidence to the Location task queue, never directly to shared or Organisation facts.
 * @param input Proposed fields and exact displayed baseline. @returns Pending task identity.
 */
export const proposeLocationTaskCorrection = guardedCommand(
  identity.extend({
    expectedAssociationVersion: z.string().min(1),
    expectedOrganisationRevision: z.string().nullable(),
    patch: LocationCorrectionPatchSchema,
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const scope = await contributionScope(ctx, input.featureId)
    const id = await proposeLocationCorrection(ctx.db, {
      ...input,
      ...scope,
      actorId: ctx.user.id,
    })
    if (!id) error(409, 'LOCATION_CORRECTION_CHANGED')
    return { taskId: `locationFacts:correction:${id}`, proposalId: id }
  },
)

/** Set Organisation consent for later underlying updates, anchored to server-read current evidence.
 * @param input Field and retain/follow policy; clients cannot supply the original comparison value.
 * @returns Accepted Organisation revision; no publication visibility changes.
 */
export const setOrganisationLocationFollowPolicy = guardedCommand(
  identity.extend({
    field: z.enum([
      'phoneNumber',
      'websites',
      'socials',
      'accessibility',
      'names',
      'brands',
      'location',
    ]),
    mode: z.enum(['retain', 'follow']),
    expectedOrganisationRevision: z.string().nullable(),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId, true)
    await requireLocationOrganisationManager(ctx, command.organisationId)
    const context = await readLocationCorrectionContext(ctx.db, command)
    if (
      !context ||
      context.expectedOrganisationRevision !== input.expectedOrganisationRevision
    )
      error(409, 'LOCATION_CORRECTION_CHANGED')
    const { readSharedLocationCorrection, sharedLocationFacts } = await import(
      '#lib/db/services/locationShared.js'
    )
    const { readLocationFacts } = await import('#lib/locations/factsSnapshot.js')
    const { prepareOrganisationLocationWrite } = await import(
      '#lib/db/services/organisationLocation.js'
    )
    const { prepareSharedFeatureAdoption } = await import(
      '#lib/db/services/locationSharedFeature.js'
    )
    const { executeRevisionBatch, prepareRevisionCheck } = await import(
      '#lib/db/services/revisionBatch.js'
    )
    const source = await ctx.db.get<{ id: string; facts: string }>(
      sql`SELECT id,facts FROM locationRevision WHERE locationId=${context.association.locationId} ORDER BY version DESC LIMIT 1`,
    )
    if (!source) error(409, 'LOCATION_SOURCE_UNAVAILABLE')
    const shared = await sharedLocationFacts(
      ctx.db,
      context.association.locationId,
      readLocationFacts(source.facts),
    )
    const head = await readSharedLocationCorrection(
      ctx.db,
      context.association.locationId,
    )
    const overrides = {
      ...context.overrides,
      freshness: {
        ...context.overrides.freshness,
        [input.field]: {
          mode: input.mode,
          original: shared.facts[input.field] ?? null,
        },
      },
    }
    const write = await prepareOrganisationLocationWrite(ctx.db, {
      ...command,
      locationId: context.association.locationId,
      actorId: ctx.user.id,
      overrides,
      guard: context.unchanged,
    })
    const feature = await prepareSharedFeatureAdoption(ctx.db, {
      ...command,
      locationId: context.association.locationId,
      sourceRevisionId: source.id,
      actorId: ctx.user.id,
      sharedRevisionId: head?.id ?? null,
      facts: shared.facts,
      fields: [],
      organisation: { revision: write.revision, overrides },
      guard: context.unchanged,
    })
    if (
      !feature ||
      !(await executeRevisionBatch(ctx.db, context.unchanged, [
        ...write.queries,
        prepareRevisionCheck(ctx.db, write.guard),
        ...feature.statements,
      ]))
    )
      error(409, 'LOCATION_CORRECTION_CHANGED')
    return { revisionId: write.revision }
  },
)
