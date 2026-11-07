// SVELTEKIT / VALIDATION
import { error } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { acceptFeatureRevisionProposal } from '#lib/db/services/featureRevision.js'
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { prepareFeatureEditorialProjection } from '#lib/db/services/featureRevisionProjection.js'
import {
  FeatureRevisionContentSchema,
  FEATURE_CONTENT_MERGE_POLICY,
} from '#lib/revisions/featureContent.js'
import { buildFeatureChanges } from '#lib/revisions/featureChanges.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
// IMAGE STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
import { transformImageRevision } from '#lib/images/revisionTransform.js'
// FEATURE ACCEPTANCE
import { FeatureChangesSchema } from '#lib/revisions/featureChanges.js'
import {
  readCurrentFeatureRevision,
  acceptPartialFeatureProposal,
} from '#lib/db/services/featureLifecycle.js'
import { prepareFeatureUploadTaskCompletion } from '#lib/db/services/featureUploadTasks.js'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { authorizeFeaturePublishForSubmission } from './services/authz/feature'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import { authorizeTaskReadForProbe } from './services/authz/task'
import { probeTaskQuery } from '#lib/db/services/task.js'
import { taskLifecycleScopeCondition } from '#lib/db/services/task-scope.js'
// SERVICES
import { prepareTaskPhotoAcceptance } from '#lib/db/services/taskPhotoAcceptance.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { hasFeatureLifecycleStorage } from '#lib/db/services/featureLifecycle.js'
import {
  imageReviewProposalAssociation,
  imageReviewPreview,
  ImageReviewPatchSchema,
  readFeatureImageReview,
  saveFeatureImageReview,
} from '#lib/db/services/featureImageReview.js'
// TABLE OF CONTENTS
// 1. Current task authority
// 2. Review reads and edits
// 3. Verified replacements and atomic acceptance
// TYPES
import type { GuardedBaseContext } from './guarded.types'

const scopeSchema = z.object({
  taskId: z.string().min(1),
  proposalId: z.string().min(1).optional(),
  meta: z.object({ isAdminRequest: z.literal(true) }),
})
const saveSchema = scopeSchema.extend({
  proposalId: z.string().min(1),
  proposalVersion: z.string(),
  expectedReviewId: z.string().nullable(),
  expectedRevisionId: z.string().nullable(),
  expectedGeneration: z.number().int().nonnegative(),
  refresh: z.boolean().optional(),
  patch: ImageReviewPatchSchema,
})

/** Resolve staff task authority and fence its current ancestry for every review operation.
 * @param ctx Request context. @param taskId Task being inspected.
 * @returns Authorization predicate for task alias t.
 */
async function authorize(ctx: GuardedBaseContext, taskId: string) {
  const probe = await probeTaskQuery(ctx.db, { ref: taskId })
  if (!probe) error(404, 'TASK_NOT_FOUND')
  const decision = authorizeTaskReadForProbe({ ...ctx, probe })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  const storage = await ctx.db.get<{ n: number }>(
    sql`SELECT count(*) n FROM pragma_table_info('featureRevisionReview') WHERE name='context'`,
  )
  if (!storage?.n) error(409, 'Apply the task image review migration before editing')
  const scope = await taskLifecycleScopeCondition(ctx.db)
  return sql`EXISTS(SELECT 1 FROM main.task AS task JOIN organisation o ON o.id=task.organisationId
    WHERE task.id=${taskId} AND task.projectId=${probe.projectId} AND task.organisationId=${probe.organisationId}
      AND o.hubId IS ${probe.resourceHubId} AND (${scope}))`
}

/** Load frozen submissions and their separate reviewer image changes.
 * @param input Task and optional proposal. @returns Authorized review snapshots.
 */
export const getTaskImageReviews = guardedQuery(scopeSchema, async (input, ctx) => {
  const guard = await authorize(ctx, input.taskId)
  const association = await imageReviewProposalAssociation(ctx.db)
  const proposals = await ctx.db.all<{
    id: string
  }>(sql`SELECT DISTINCT p.id FROM featureRevisionProposal p
    JOIN task t ON t.id=${input.taskId} WHERE (${association})
      AND (${input.proposalId ?? null} IS NULL OR p.id=${input.proposalId ?? null}) AND (${guard})`)
  const reviews = await Promise.all(
    proposals.map(({ id }) =>
      readFeatureImageReview(ctx.db, { ...input, proposalId: id, guard }),
    ),
  )
  return reviews.filter(review => review !== null).map(imageReviewPreview)
})

/** Save only review-owned image edits using the exact preview tokens.
 * @param input Displayed review and allowlisted image changes. @returns Updated review snapshot.
 */
export const saveTaskImageReview = guardedCommand(saveSchema, async (input, ctx) => {
  const guard = await authorize(ctx, input.taskId)
  const id = await saveFeatureImageReview(ctx.db, {
    ...input,
    actorId: ctx.userId,
    guard,
  })
  if (!id) error(409, 'Review changed; refresh before saving')
  const updated = await readFeatureImageReview(ctx.db, { ...input, guard })
  return updated ? imageReviewPreview(updated) : null
})

/** Replace review bytes under a fresh immutable key after decoding them with the image service.
 * @param input Exact preview tokens and encoded replacement file. @returns Updated reviewer snapshot.
 * @remarks No submitted asset, mutable sidecar or accepted gallery is overwritten.
 */
export const replaceTaskReviewImage = guardedCommand(
  saveSchema.extend({
    bytes: z.string().max(28 * 1024 * 1024),
    mediaType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
    ]),
  }),
  async (input, ctx) => {
    const guard = await authorize(ctx, input.taskId)
    const review = await readFeatureImageReview(ctx.db, { ...input, guard })
    if (
      !review ||
      review.stale ||
      review.status !== 'submitted' ||
      review.reviewId !== input.expectedReviewId ||
      review.proposalVersion !== input.proposalVersion ||
      review.currentRevisionId !== input.expectedRevisionId ||
      review.currentGeneration !== input.expectedGeneration ||
      !review.content.gallery.entries[input.patch.imageId]
    )
      error(409, 'Review changed; refresh before replacing')
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = Uint8Array.from(atob(input.bytes), c => c.charCodeAt(0))
    } catch {
      error(400, 'Invalid replacement file')
    }
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024)
      error(400, 'Replacement must be at most 20 MB')
    const platform = ctx.event.locals.platform
    const decoded = await transformImageRevision(
      platform?.env.ASSET_TRANSFORMER,
      bytes.buffer,
      input.mediaType,
      { renderRotation: 0 },
      new URL('https://review.invalid/?t=c_fit,w_1,h_1'),
    )
    await decoded?.arrayBuffer()
    const stage = toImageStage(platform?.env.ENVIRONMENT)
    const bucket = getOriginalsBucketForStage(platform, stage)
    const storageKey = `review/${crypto.randomUUID()}`
    const contentHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      n => n.toString(16).padStart(2, '0'),
    ).join('')
    await bucket.put(storageKey, bytes, {
      httpMetadata: { contentType: input.mediaType },
    })
    const id = await saveFeatureImageReview(ctx.db, {
      ...input,
      actorId: ctx.userId,
      guard,
      replacement: {
        storageKey,
        storageNamespace: stage,
        contentHash,
        mediaType: input.mediaType,
        byteSize: bytes.byteLength,
      },
    })
    if (!id) error(409, 'Review changed during upload; refresh before replacing')
    const updated = await readFeatureImageReview(ctx.db, { ...input, guard })
    return updated ? imageReviewPreview(updated) : null
  },
)

/** Accept a photo-only proposal using the exact image review displayed in its task.
 * @param input Proposal and review tokens. @returns Atomic acceptance or conflict result.
 */
export const acceptTaskImageReview = guardedCommand(
  saveSchema.omit({ patch: true }).extend({
    mode: z.enum(['acceptAll', 'acceptClassified']).optional(),
    reviews: z
      .array(saveSchema.omit({ patch: true, taskId: true, meta: true, refresh: true }))
      .min(1)
      .max(1000)
      .optional(),
  }),
  async (input, ctx) => {
    const guard = await authorize(ctx, input.taskId)
    let review = await readFeatureImageReview(ctx.db, { ...input, guard })
    if (
      !review?.featureId ||
      review.stale ||
      review.proposalVersion !== input.proposalVersion ||
      review.reviewId !== input.expectedReviewId ||
      review.currentRevisionId !== input.expectedRevisionId
    )
      error(409, 'Review changed; refresh before accepting')
    const probe = await probeFeatureForUpdate(ctx.db, review.featureId)
    if (!probe) error(404, 'FEATURE_NOT_FOUND')
    const decision = authorizeFeaturePublishForSubmission({ ...ctx, resource: probe })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    const featureGuard = buildFeatureCommandScopeGuard(ctx.db, review.featureId, probe)
    let acceptanceGuard = sql`(${guard}) AND (${featureGuard})`
    // A task-level action validates every inspected proposal before any publication occurs.
    const taskPlan =
      input.mode && input.reviews
        ? await prepareTaskPhotoAcceptance(
            ctx.db,
            {
              taskId: input.taskId,
              actorId: ctx.userId,
              mode: input.mode,
              reviews: input.reviews,
            },
            acceptanceGuard,
          )
        : null
    if (input.mode && !taskPlan)
      error(409, 'Task photos changed; reload before accepting')
    if (taskPlan) {
      acceptanceGuard = taskPlan.guard
      if (taskPlan.rejectAll) {
        const committed = await executeRevisionBatch(
          ctx.db,
          taskPlan.guard,
          taskPlan.decisions,
        )
        return committed
          ? { status: 'accepted' as const }
          : { status: 'stale' as const }
      }
      review = taskPlan.primary
      input = {
        ...input,
        proposalId: review.proposalId,
        proposalVersion: review.proposalVersion,
        expectedReviewId: review.reviewId,
        expectedRevisionId: review.currentRevisionId,
        expectedGeneration: review.currentGeneration,
      }
    }
    const proposal = await ctx.db.get<{ changes: string; base: string }>(
      review.lifecycle
        ? sql`SELECT p.changes,r.content base FROM featureRevisionProposal p JOIN featureRevision r ON r.id=p.baseRevisionId WHERE p.id=${input.proposalId}`
        : sql`SELECT c.content changes,b.content base FROM featureRevisionProposal p JOIN featureRevision c ON c.id=p.candidateRevisionId JOIN featureRevision b ON b.id=p.baseRevisionId WHERE p.id=${input.proposalId}`,
    )
    const changes = review.lifecycle
      ? FeatureChangesSchema.parse(JSON.parse(proposal!.changes))
      : buildFeatureChanges(
          FeatureRevisionContentSchema.parse(JSON.parse(proposal!.base)),
          FeatureRevisionContentSchema.parse(JSON.parse(proposal!.changes)),
        )
    if (
      changes.operations.some(
        operation =>
          ![
            'addImage',
            'editImage',
            'removeImage',
            'orderImages',
            'setGallerySortMode',
          ].includes(operation.op),
      )
    )
      error(409, 'Review the complete Feature proposal before accepting')
    if (!review.lifecycle) {
      const head = await ctx.db.get<{
        publishedRevisionId: string | null
        generation: number
      }>(
        sql`SELECT publishedRevisionId,generation FROM featureRevisionHead WHERE featureId=${review.featureId}`,
      )
      if (!head || head.generation !== input.expectedGeneration)
        error(409, 'Feature changed; refresh before accepting')
      const row = await ctx.db.get<{ content: string }>(
        sql`SELECT content FROM featureRevision WHERE id=${review.currentRevisionId} AND featureId=${review.featureId}`,
      )
      const previous = FeatureRevisionContentSchema.parse(JSON.parse(row!.content))
      const source = await readFeatureRevisionSource(
        ctx.db,
        review.featureId!,
        acceptanceGuard,
      )
      if (!source) error(409, 'Feature changed; refresh before accepting')
      const completion =
        taskPlan?.decisions ??
        (await prepareFeatureUploadTaskCompletion(ctx.db, {
          featureId: review.featureId!,
          proposalId: review.proposalId,
          actorId: ctx.userId,
        }))
      return acceptFeatureRevisionProposal(ctx.db, {
        featureId: review.featureId!,
        proposalId: review.proposalId,
        expectedCandidateRevisionId: review.proposalVersion,
        expectedPublishedRevisionId: head.publishedRevisionId,
        expectedComparisonRevisionId: review.currentRevisionId!,
        expectedGeneration: head.generation,
        publicationIntent: head.publishedRevisionId
          ? 'update'
          : head.generation === 0
            ? 'initial'
            : 'republish',
        imageReview: { taskId: input.taskId, reviewId: input.expectedReviewId },
        reviewedContent: taskPlan?.content,
        actorId: ctx.userId,
        publisherUserId: ctx.userId,
        guard: sql`(${acceptanceGuard}) AND (${source.unchanged})`,
        decisionStatements: completion,
        mergePolicy: FEATURE_CONTENT_MERGE_POLICY,
        validate: content =>
          FeatureRevisionContentSchema.safeParse(content).success
            ? []
            : ['Invalid reviewed gallery'],
        project: content =>
          prepareFeatureEditorialProjection(ctx.db, {
            featureId: review.featureId!,
            previous,
            content: FeatureRevisionContentSchema.parse(content),
            source,
            gallery: { actorId: ctx.userId, attachmentGuard: acceptanceGuard },
          }),
      })
    }
    const current = await readCurrentFeatureRevision(ctx.db, {
      featureId: review.featureId!,
      guard,
    })
    if (!current || current.revisionId !== input.expectedRevisionId)
      error(409, 'Feature changed; refresh before accepting')
    const completion =
      taskPlan?.decisions ??
      (await prepareFeatureUploadTaskCompletion(ctx.db, {
        featureId: review.featureId!,
        proposalId: review.proposalId,
        actorId: ctx.userId,
        reason: 'Reviewed task images accepted',
      }))
    return acceptPartialFeatureProposal(ctx.db, {
      featureId: review.featureId!,
      proposalId: review.proposalId,
      expectedProposalVersion: review.proposalVersion,
      expectedRevisionId: current.revisionId,
      expectedVersion: current.version,
      imageReview: { taskId: input.taskId, reviewId: input.expectedReviewId },
      reviewedContent: taskPlan?.content,
      actorId: ctx.userId,
      guard: acceptanceGuard,
      attachmentGuard: acceptanceGuard,
      completion,
      reason: 'Reviewed task images accepted',
      validate: () => [],
    })
  },
)
