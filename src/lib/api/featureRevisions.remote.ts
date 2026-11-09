// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
import {
  authorizeFeatureUpdateForSubmission,
  authorizeFeaturePublishForSubmission,
} from './services/authz/feature'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  FeatureTranslationPatchSchema,
  applyFeatureTranslationPatch,
} from '#lib/revisions/featureContent.js'
import {
  validateFeatureTranslationResult,
  canReviewFeatureTranslationPath,
} from '#lib/revisions/featureTranslationReview.js'
// SERVICES
import {
  hasFeatureLifecycleStorage,
  readCurrentFeatureRevision,
} from '#lib/db/services/featureLifecycle.js'
import { readPartialFeatureProposal } from '#lib/db/services/featureLifecycleProposal.js'
import { prepareFeatureAcceptedCapture } from '#lib/db/services/featureAcceptedCapture.js'
import { prepareFeatureEditorialProjection } from '#lib/db/services/featureRevisionProjection.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import {
  validateFeatureFormResult,
  validateFeatureFormPropertyValues,
} from '#lib/db/services/featureFormReview.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { diffRevisionValues } from '#lib/revisions/diff.js'
import { validateFeatureGalleryResult } from '#lib/revisions/featureGalleryReview.js'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { readFeaturePresentationPolicy } from '#lib/db/services/featurePresentationPolicy.js'
import { readFeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import {
  readFeaturePublicationChanges,
  readFeaturePrivateChanges,
} from '#lib/db/services/featureRevisionHistory.js'
import { readFeatureImageMetadataChanges } from '#lib/db/services/featureImageRevisionReview.js'
import { readFeatureUploadAttachmentGrant } from '#lib/db/services/featureImageUploadRevision.js'
import { prepareFeatureUploadTaskCompletion } from '#lib/db/services/featureUploadTasks.js'
import { acceptFeatureEditorialRevision } from '#lib/db/services/featureEditorialRevision.js'
import { publishFeatureStaffDraft } from '#lib/db/services/featureStaffRevision.js'
import {
  submitFeatureRevisionProposal,
  rejectFeatureRevisionProposal,
  withdrawFeatureRevisionProposal,
} from '#lib/db/services/featureRevision.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'
import type { Id } from '#lib/types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Current scope and permissions
// 2. Translation workspace and draft commands
// 3. Explicit publication and review decisions
// ═══════════════════════

const identity = z.object({
  featureId: z.string().min(1),
  meta: z.object({ isAdminRequest: z.boolean().optional() }).optional(),
})
const candidate = identity.extend({
  proposalId: z.string().min(1),
  expectedCandidateRevisionId: z.string().min(1),
})

/**
 * Resolves persisted ancestry and existing translator/publisher permissions for each request.
 * @param ctx Authenticated remote request context.
 * @param featureId Requested Feature identity.
 * @returns Server-owned guard, scope, actor, publication authority and permitted text fields.
 */
async function scope(ctx: GuardedBaseContext, featureId: string) {
  const probe = await probeFeatureForUpdate(ctx.db, featureId as Id)
  if (!probe) error(404, 'FEATURE_NOT_FOUND')
  const common = { user: ctx.user, userRoles: ctx.userRoles, resource: probe }
  const edit = authorizeFeatureUpdateForSubmission({
    ...common,
    submittedData: { i18n: {} },
  })
  if (!edit.allowed) error(403, edit.code ?? 'INSUFFICIENT_ROLE')
  const expectedScope = {
    organisationId: probe.organisationId,
    projectId: probe.projectId,
    layerId: probe.layerId,
    resourceHubId: probe.resourceHubId,
  }
  const policy = await readFeaturePresentationPolicy(ctx.db, probe.layerId)
  const fields: ('title' | 'description')[] = policy.allowDescriptions
    ? ['title', 'description']
    : ['title']
  return {
    featureId,
    actorId: ctx.user.id,
    publisherUserId: ctx.user.id,
    expectedScope,
    guard: buildFeatureCommandScopeGuard(ctx.db, featureId, expectedScope),
    canPublish: authorizeFeaturePublishForSubmission(common).allowed,
    fields,
    validateResult: (
      previous: z.infer<typeof FeatureRevisionContentSchema>,
      result: z.infer<typeof FeatureRevisionContentSchema>,
    ) => validateFeatureTranslationResult(previous, result, fields),
    canReviewPath: (path: readonly string[]) =>
      canReviewFeatureTranslationPath(path, fields),
  }
}

/**
 * Loads text-only revision history, current publication tokens and the authorized review queue.
 * @param input Feature identity.
 * @returns Safe workspace plus current publication and text-field capabilities.
 */
export const getFeatureRevisionWorkspace = guardedQuery(
  identity.extend({ taskId: z.string().min(1).optional() }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (input.taskId) {
      const rows = await ctx.db.all<{
        proposalId: string
      }>(sql`SELECT proposalId FROM featureImageUploadRevision
        WHERE featureId=${input.featureId} AND EXISTS (SELECT 1 FROM json_each(taskIds) WHERE value=${input.taskId})`)
      workspace.proposals = workspace.proposals.filter(proposal =>
        rows.some(row => row.proposalId === proposal.id),
      )
    }
    return {
      ...workspace,
      canPublish: command.canPublish,
      fields: command.fields,
    }
  },
)

/**
 * Shows the actual accepted changes and retains current internal-field privacy.
 * @param input Feature identity and immutable publication generation.
 * @returns Safe field differences or a baseline/unpublication marker.
 */
export const getFeaturePublicationReview = guardedQuery(
  identity.extend({ generation: z.number().int().nonnegative() }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
    const access = await getInternalPropertyAccess(ctx)
    const result = await readFeaturePublicationChanges(ctx.db, {
      ...command,
      generation: input.generation,
      internalIds: access.internal,
      allowedInternalIds: access.allowed,
    })
    if (!result) error(404, 'PUBLICATION_NOT_FOUND')
    return result
  },
)

/**
 * Saves a small translation patch on a server-loaded snapshot, preserving all hidden content.
 * @param input Exact base/candidate identifiers and allowed text changes.
 * @returns Accepted revision ID; existing publication visibility is preserved.
 * @remarks The legacy endpoint name is retained for callers; authorised staff saves do not create drafts.
 */
export const saveFeatureTranslationDraft = guardedCommand(
  identity.extend({
    baseRevisionId: z.string().min(1),
    expectedGeneration: z.number().int().nonnegative(),
    patch: FeatureTranslationPatchSchema,
    draft: z
      .object({ proposalId: z.string().min(1), candidateRevisionId: z.string().min(1) })
      .optional(),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    // This endpoint already requires staff translation authority; it must not queue a proposal.
    if (input.draft)
      error(409, 'Reopen the regular editor to save against current accepted content')
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (
      !workspace.enabled ||
      workspace.comparisonRevisionId !== input.baseRevisionId ||
      workspace.generation !== input.expectedGeneration
    )
      error(409, 'STALE_REVISION')
    const row = await ctx.db.get<{
      content: string
    }>(sql`SELECT content FROM featureRevision
      WHERE featureId=${input.featureId} AND id=${input.baseRevisionId} AND (${command.guard})`)
    if (!row) error(409, 'STALE_REVISION')
    const previous = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    const content = applyFeatureTranslationPatch(previous, input.patch, {
      locales: Object.keys(previous.translations),
      fields: command.fields,
    })
    const errors = command.validateResult(previous, content)
    if (errors.length) error(400, errors.join('; '))
    const source = await readFeatureRevisionSource(
      ctx.db,
      input.featureId,
      command.guard,
    )
    if (!source) error(409, 'STALE_REVISION')
    const capture = await prepareFeatureAcceptedCapture(ctx.db, {
      ...command,
      reason: 'Feature translations edited',
      derive: current => {
        if (!equalRevisionValue(current, previous)) throw new Error('STALE_REVISION')
        return content
      },
    })
    if (!capture.revisionId) error(409, 'STALE_REVISION')
    const projection = prepareFeatureEditorialProjection(ctx.db, {
      featureId: input.featureId,
      source,
      previous,
      content,
    })
    // Commit authorized text and immutable history together, preserving current visibility.
    const saved = await executeRevisionBatch(
      ctx.db,
      sql`(${command.guard}) AND (${source.unchanged})`,
      [
        ...capture.before,
        ...projection.statements,
        ...(projection.afterPublication ?? []),
        ...capture.after,
        prepareRevisionCheck(ctx.db, projection.verify),
      ],
    )
    if (!saved) error(409, 'STALE_REVISION')
    return { revisionId: capture.revisionId }
  },
)

/**
 * Submits the author's exact draft without altering the Feature's publication flags.
 * @param input Owned proposal and exact candidate token.
 * @returns Whether submission committed.
 */
export const submitFeatureTranslationDraft = guardedCommand(
  candidate,
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (workspace.initialContribution)
      error(409, 'Review this initial contribution through its task')
    if (!(await submitFeatureRevisionProposal(ctx.db, { ...command, ...input })))
      error(409, 'STALE_REVISION')
    return { submitted: true }
  },
)

/**
 * Publishes an explicitly selected staff draft or accepts a submitted translation proposal.
 * @param input Exact inspected heads and whole-field conflict resolutions.
 * @returns Publication, stale-state or safe translation conflict outcome.
 * @remarks Contributor acceptance never republishes an unpublished Feature. Initial
 * publication/republication is restricted to the staff member's own saved draft.
 */
export const publishFeatureTranslationRevision = guardedCommand(
  candidate.extend({
    ownDraft: z.boolean(),
    expectedPublishedRevisionId: z.string().nullable(),
    expectedComparisonRevisionId: z.string().min(1),
    expectedGeneration: z.number().int().nonnegative(),
    resolutions: z
      .array(
        z.object({
          path: z.array(z.string()).length(3),
          result: z.object({
            present: z.literal(true),
            value: z.object({ value: z.string().nullable(), generated: z.boolean() }),
          }),
        }),
      )
      .max(100)
      .optional(),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
    if (input.ownDraft)
      return publishFeatureStaffDraft(ctx.db, { ...command, ...input })
    if (!input.expectedPublishedRevisionId) error(409, 'FEATURE_NOT_PUBLISHED')
    return acceptFeatureEditorialRevision(ctx.db, {
      ...command,
      ...input,
      expectedPublishedRevisionId: input.expectedPublishedRevisionId,
    })
  },
)

/**
 * Records a rejection or author withdrawal without changing any published data.
 * @param input Exact candidate, decision and rejection explanation.
 * @returns Whether the terminal decision committed.
 */
export const decideFeatureTranslationRevision = guardedCommand(
  candidate.extend({
    action: z.enum(['reject', 'withdraw']),
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (workspace.initialContribution)
      error(409, 'Review this initial contribution through its task')
    if (input.action === 'reject' && !command.canPublish)
      error(403, 'INSUFFICIENT_ROLE')
    const success =
      input.action === 'reject'
        ? await rejectFeatureRevisionProposal(ctx.db, {
            ...command,
            ...input,
            decisionStatements: await prepareFeatureUploadTaskCompletion(ctx.db, {
              ...command,
              ...input,
            }),
          })
        : await withdrawFeatureRevisionProposal(ctx.db, { ...command, ...input })
    if (!success) error(409, 'STALE_REVISION')
    return { decided: true }
  },
)

/**
 * Resolves an exact saved form candidate under current publishing and field permissions.
 * @param ctx Authenticated request context.
 * @param input Feature, proposal and exact candidate token inspected by the caller.
 * @returns Server-only snapshots, current validators and a transactional source fence.
 */
async function formReview(ctx: GuardedBaseContext, input: z.infer<typeof candidate>) {
  const command = await scope(ctx, input.featureId)
  if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
  const lifecycle = await hasFeatureLifecycleStorage(ctx.db)
  const partial = lifecycle
    ? await readPartialFeatureProposal(ctx.db, {
        ...input,
        guard: command.guard,
        version: input.expectedCandidateRevisionId,
      })
    : null
  if (
    lifecycle &&
    (!partial ||
      !(
        partial.status === 'submitted' ||
        (partial.status === 'draft' && partial.contributorId === ctx.user.id)
      ))
  )
    error(409, 'STALE_REVISION')
  const row =
    lifecycle && partial
      ? { before: JSON.stringify(partial.base), after: JSON.stringify(partial.content) }
      : await ctx.db.get<{ before: string; after: string }>(sql`
    SELECT b.content AS before,c.content AS after FROM featureRevisionProposal p
    JOIN featureRevision b ON b.id=p.baseRevisionId AND b.featureId=p.featureId
    JOIN featureRevision c ON c.id=p.candidateRevisionId AND c.featureId=p.featureId
    WHERE p.featureId=${input.featureId} AND p.id=${input.proposalId}
      AND p.candidateRevisionId=${input.expectedCandidateRevisionId}
      AND (p.status='submitted' OR (p.status='draft' AND p.contributorId=${ctx.user.id}))
      AND (${command.guard})`)
  if (!row) error(409, 'STALE_REVISION')
  const before = FeatureRevisionContentSchema.parse(JSON.parse(row.before))
  const after = FeatureRevisionContentSchema.parse(JSON.parse(row.after))
  // Current accepted content can retain an internal classification absent from both proposal parents.
  const accepted = lifecycle ? await readCurrentFeatureRevision(ctx.db, command) : null
  const currentRow = lifecycle
    ? accepted
      ? { content: JSON.stringify(accepted.content) }
      : null
    : await ctx.db.get<{
        content: string
      }>(sql`SELECT r.content FROM featureRevisionHead h
    JOIN featureRevision r ON r.id=h.publishedRevisionId AND r.featureId=h.featureId
    WHERE h.featureId=${input.featureId} AND (${command.guard})`)
  const current = currentRow
    ? FeatureRevisionContentSchema.parse(JSON.parse(currentRow.content))
    : before
  const access = await getInternalPropertyAccess(ctx)
  const source = await readFeatureRevisionSource(
    ctx.db,
    input.featureId,
    command.guard,
    [
      ...new Set([
        ...Object.keys(before.properties),
        ...Object.keys(after.properties),
        ...Object.keys(current.properties),
      ]),
    ],
  )
  if (!source) error(409, 'STALE_REVISION')
  const attachments = await readFeatureUploadAttachmentGrant(ctx.db, {
    ...command,
    proposalId: input.proposalId,
  })
  const galleryOnly = !validateFeatureGalleryResult(before, after, attachments.pins)
    .length
  const validateResult = (previous: typeof before, result: typeof after): string[] =>
    galleryOnly
      ? validateFeatureGalleryResult(previous, result, attachments.pins)
      : validateFeatureFormResult(previous, result, {
          snapshot: source.snapshot,
          allowedInternalIds: access.allowed,
          allowDescriptions: command.fields.includes('description'),
          resourceHubId: command.expectedScope.resourceHubId,
        })
  const errors = validateResult(before, after)
  if (errors.length) error(403, errors.join('; '))
  const privateIds = new Set([
    ...access.internal,
    ...Object.entries(before.properties)
      .filter(([, row]) => row.selection.definition.audience === 'internal')
      .map(([id]) => id),
    ...Object.entries(after.properties)
      .filter(([, row]) => row.selection.definition.audience === 'internal')
      .map(([id]) => id),
    ...Object.entries(current.properties)
      .filter(([, row]) => row.selection.definition.audience === 'internal')
      .map(([id]) => id),
  ])
  const canReviewPath = (path: readonly string[]): boolean => {
    if (galleryOnly) return path[0] === 'gallery'
    if (
      ![
        'profile',
        'placement',
        'translations',
        'properties',
        'detachedBrands',
      ].includes(path[0])
    )
      return false
    if (path[0] !== 'properties') return true
    return path.length > 1
      ? !privateIds.has(path[1]) || access.allowed.has(path[1])
      : [...privateIds].every(id => access.allowed.has(id))
  }
  return {
    ...command,
    before,
    after,
    validateResult,
    canReviewPath,
    galleryAttachmentGuard: attachments.pins.size ? attachments.guard : undefined,
    guard: sql`(${command.guard}) AND (${source.unchanged})`,
    validateBeforeProjection: (previous: typeof before, result: typeof after) =>
      validateFeatureFormPropertyValues(
        ctx.db,
        previous,
        result,
        access.allowed,
        command.expectedScope.layerId,
      ),
  }
}

/**
 * Shows only changed, currently authorized values from a saved ordinary Feature form.
 * @param input Exact owned draft or submitted proposal token.
 * @returns Safe review differences; unchanged hidden fields never leave the server.
 */
export const getFeatureFormRevisionReview = guardedQuery(
  candidate,
  async (input, ctx) => {
    const review = await formReview(ctx, input)
    const changes = diffRevisionValues(
      { present: true, value: review.before },
      { present: true, value: review.after },
    )
    if (changes.some(change => !review.canReviewPath(change.path)))
      error(403, 'FIELD_FORBIDDEN')
    const images = [
      ...new Set([...review.before.gallery.order, ...review.after.gallery.order]),
    ].flatMap(imageId => {
      const before = review.before.gallery.entries[imageId]?.imageRevisionId ?? null
      const after = review.after.gallery.entries[imageId]?.imageRevisionId ?? null
      return before === after ? [] : [{ imageId, before, after }]
    })
    return {
      changes: [
        ...changes,
        ...(await readFeatureImageMetadataChanges(ctx.db, review.before, review.after)),
      ],
      images,
    }
  },
)

/**
 * Publishes an inspected staff draft or accepts a submitted general Feature proposal.
 * @param input Exact draft/head tokens and whole-field conflict choices.
 * @returns Accepted revision, stale comparison or permission-filtered conflicts.
 * @remarks Shared Location corrections stay outside this command. Complete merged
 * property values are revalidated before projection, including user-selected resolutions.
 */
export const publishFeatureFormRevision = guardedCommand(
  candidate.extend({
    ownDraft: z.boolean(),
    expectedPublishedRevisionId: z.string().nullable(),
    expectedComparisonRevisionId: z.string().min(1),
    expectedGeneration: z.number().int().nonnegative(),
    resolutions: z
      .array(
        z.object({
          path: z.array(z.string()).min(1).max(8),
          result: z.discriminatedUnion('present', [
            z.object({ present: z.literal(false) }),
            z.object({ present: z.literal(true), value: z.json() }),
          ]),
        }),
      )
      .max(200)
      .optional(),
  }),
  async (input, ctx) => {
    const review = await formReview(ctx, input)
    try {
      if (await hasFeatureLifecycleStorage(ctx.db)) {
        if (input.ownDraft)
          return {
            status: 'invalid' as const,
            errors: [
              'Staff edits are saved directly in the regular editor. Submit contributions through their task before review.',
            ],
          }
        return await acceptFeatureEditorialRevision(ctx.db, {
          ...review,
          ...input,
          expectedPublishedRevisionId: input.expectedComparisonRevisionId,
        })
      }
      if (input.ownDraft)
        return await publishFeatureStaffDraft(ctx.db, { ...review, ...input })
      if (
        !input.expectedPublishedRevisionId ||
        input.expectedComparisonRevisionId !== input.expectedPublishedRevisionId
      )
        return { status: 'stale' as const }
      return await acceptFeatureEditorialRevision(ctx.db, {
        ...review,
        ...input,
        expectedPublishedRevisionId: input.expectedPublishedRevisionId,
      })
    } catch (cause) {
      // Domain validation errors leave the saved draft intact and reviewable.
      return {
        status: 'invalid' as const,
        errors: [cause instanceof Error ? cause.message : 'Feature publication failed'],
      }
    }
  },
)

/**
 * Loads the accepted gallery for an authorized Feature publisher's draft editor.
 * @param input Feature identity.
 * @returns Exact comparison token, ordered pins and locale names; no property or Location snapshots.
 */
export const getFeatureGalleryRevisionEditor = guardedQuery(
  identity,
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (
      !workspace.enabled ||
      workspace.state !== 'active' ||
      !workspace.comparisonRevisionId
    )
      return { enabled: false as const }
    const row = await ctx.db.get<{
      content: string
    }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${workspace.comparisonRevisionId} AND (${command.guard})`)
    if (!row) error(409, 'STALE_REVISION')
    const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    return {
      enabled: true as const,
      comparisonRevisionId: workspace.comparisonRevisionId,
      published: workspace.publishedRevisionId !== null,
      gallery: content.gallery,
      locales: Object.keys(content.translations),
    }
  },
)

/**
 * Saves accepted gallery ordering, captions, accessibility text and removals directly.
 * @param input Exact inspected comparison and gallery-only edits.
 * @returns Accepted revision token; Feature publication state and image bytes stay unchanged.
 */
export const saveFeatureGalleryRevision = guardedCommand(
  identity.extend({
    baseRevisionId: z.string().min(1),
    order: z.array(z.string().min(1)).max(1000),
    sortMode: z.enum(['automatic', 'manual']).optional(),
    text: z.record(
      z.string().min(1),
      z.object({
        caption: z.record(z.string().min(1).max(80), z.string().max(4000)),
        alt: z.record(z.string().min(1).max(80), z.string().max(2000)),
      }),
    ),
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
    const workspace = await readFeatureRevisionWorkspace(ctx.db, command)
    if (!workspace.enabled || workspace.comparisonRevisionId !== input.baseRevisionId)
      error(409, 'STALE_REVISION')
    const row = await ctx.db.get<{
      content: string
    }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${input.baseRevisionId} AND (${command.guard})`)
    if (!row) error(409, 'STALE_REVISION')
    const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    const selected = new Set(input.order)
    if (
      selected.size !== input.order.length ||
      input.order.some(id => !Object.hasOwn(content.gallery.entries, id)) ||
      Object.keys(input.text).some(id => !selected.has(id))
    )
      error(400, 'INVALID_GALLERY')
    // Sorting never doubles as membership removal; text-only callers preserve the mode.
    if (input.sortMode && selected.size !== Object.keys(content.gallery.entries).length)
      error(400, 'INVALID_GALLERY')
    if (input.sortMode) content.gallery.sortMode = input.sortMode
    content.gallery.order = input.order
    content.gallery.entries = Object.fromEntries(
      input.order.map(id => [
        id,
        {
          ...content.gallery.entries[id],
          ...(input.text[id] ?? {}),
        },
      ]),
    )
    const previous = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    const errors = validateFeatureGalleryResult(previous, content)
    if (errors.length) error(400, errors.join('; '))
    const source = await readFeatureRevisionSource(
      ctx.db,
      input.featureId,
      command.guard,
    )
    if (!source) error(409, 'STALE_REVISION')
    const capture = await prepareFeatureAcceptedCapture(ctx.db, {
      ...command,
      reason: 'Gallery edited',
      derive: current => {
        if (!equalRevisionValue(current, previous))
          throw new Error('Gallery changed; refresh before saving')
        return content
      },
    })
    const projection = prepareFeatureEditorialProjection(ctx.db, {
      featureId: input.featureId,
      source,
      previous,
      content,
      gallery: { actorId: command.actorId },
    })
    const saved = await executeRevisionBatch(
      ctx.db,
      sql`(${command.guard}) AND (${source.unchanged})`,
      [
        ...capture.before,
        ...projection.statements,
        ...(projection.afterPublication ?? []),
        ...capture.after,
        prepareRevisionCheck(ctx.db, projection.verify),
      ],
    )
    if (!saved) error(409, 'STALE_REVISION')
    return { revisionId: capture.revisionId }
  },
)

/** Shows approved private changes without treating them as publications.
 * @param input Feature and exact private journal revision. @returns Permission-filtered differences.
 */
export const getFeaturePrivateReview = guardedQuery(
  identity.extend({ revisionId: z.string().min(1) }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (!command.canPublish) error(403, 'INSUFFICIENT_ROLE')
    const access = await getInternalPropertyAccess(ctx)
    const result = await readFeaturePrivateChanges(ctx.db, {
      ...command,
      ...input,
      internalIds: access.internal,
      allowedInternalIds: access.allowed,
    })
    if (!result) error(404, 'REVISION_NOT_FOUND')
    return result
  },
)
