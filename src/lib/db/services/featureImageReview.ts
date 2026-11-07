// GALLERY ORDER
import { orderGallery } from '#lib/images/galleryOrder.js'
// IMAGE INTENT POLICY
import {
  readImageIntentPolicy,
  readFeatureImageIntentPolicy,
  resolvePolicyImageIntent,
} from './imageIntentPolicy'
// DRIZZLE / VALIDATION
import { sql } from 'drizzle-orm'
import { z } from 'zod'
// DOMAIN
import { ImageIntentIdSchema } from '#lib/images/intents.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import {
  FeatureChangesSchema,
  applyFeatureChanges,
  buildFeatureChanges,
} from '#lib/revisions/featureChanges.js'
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// SCHEMA
import {
  partialFeatureReview,
  legacyImageReview,
} from '../schema/featureLifecycle.target'
import { imageRevision, imageAssetVersion } from '../schema/imageRevision'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { privateFeatureComparison } from './featurePrivateCapture'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

// TABLE OF CONTENTS
// 1. Review input and immutable snapshot reads
// 2. Reviewer changes and concurrency guards
// 3. Acceptance preparation

export const ImageReviewPatchSchema = z.strictObject({
  imageId: z.string().min(1),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional(),
  intent: ImageIntentIdSchema.optional(),
  isPublished: z.boolean().optional(),
  caption: z.record(z.string().min(1), z.string()).optional(),
  alt: z.record(z.string().min(1), z.string()).optional(),
  included: z.boolean().optional(),
  order: z.array(z.string().min(1)).optional(),
  sortMode: z.enum(['automatic', 'manual']).optional(),
})
const reviewContext = z.object({
  kind: z.literal('image-review/v1'),
  taskId: z.string(),
  previousReviewId: z.string().nullable(),
  gallery: z.object({
    entries: z.record(z.string(), z.unknown()),
    order: z.array(z.string()),
    sortMode: z.enum(['automatic', 'manual']).optional(),
  }),
  excluded: z.array(z.string()),
  comparedGeneration: z.number().optional(),
})
export type FeatureImageReview = {
  proposalId: string
  proposalVersion: string
  intentOrder?: string[]
  imageIds?: string[]
  featureId: string | null
  taskId: string
  reviewId: string | null
  comparedRevisionId: string | null
  currentRevisionId: string | null
  content: FeatureRevisionContent
  submitted: FeatureRevisionContent
  excluded: string[]
  status: string
  stale: boolean
  initialProposal: boolean
  lifecycle: boolean
  comparisonGuard: SQL
  currentGeneration: number
  images: Record<
    string,
    {
      createdAt?: string
      contributorId?: string | null
      metadata: Record<string, unknown>
      originalMetadata: Record<string, unknown>
      originalRevisionId: string
    }
  >
}

export type ImageReviewPreview = Omit<
  FeatureImageReview,
  'content' | 'submitted' | 'comparisonGuard'
> & {
  content: Pick<FeatureRevisionContent, 'gallery'>
  submitted: Pick<FeatureRevisionContent, 'gallery'>
}

/** Limit task image responses to gallery evidence; unrelated private Feature fields never leave the server.
 * @param review Authorized server snapshot. @returns Image-only preview data.
 */
export function imageReviewPreview(review: FeatureImageReview): ImageReviewPreview {
  const { comparisonGuard: _guard, ...preview } = review
  return {
    ...preview,
    content: { gallery: review.content.gallery },
    submitted: { gallery: review.submitted.gallery },
  }
}

/** Read the review separately from frozen contributor content and upload evidence.
 * @param db Request database. @param input Authorized exact proposal/task association.
 * @returns Submitted content and the latest immutable reviewer snapshot, or null.
 * @remarks The SQL guard belongs to the caller's current task authorization.
 */
export async function readFeatureImageReview(
  db: Database,
  input: { taskId: string; proposalId: string; guard: SQL },
): Promise<FeatureImageReview | null> {
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const association = await imageReviewProposalAssociation(db)
  const privateHead = lifecycle
    ? sql`NULL`
    : await privateFeatureComparison(db, sql`p.featureId`, sql`h.generation`)
  const row = await db.get<{
    id: string
    version: string
    featureId: string | null
    status: string
    changes: string
    base: string | null
    currentRevisionId: string | null
    initialProposal: number
    currentGeneration: number
  }>(
    lifecycle
      ? sql`
    SELECT p.id,p.version,p.featureId,p.status,p.changes,r.content base,f.currentRevisionId,t.proposalId=p.id initialProposal,COALESCE(f.revisionVersion,0) currentGeneration
    FROM featureRevisionProposal p LEFT JOIN featureRevision r ON r.id=p.baseRevisionId
    LEFT JOIN feature f ON f.id=p.featureId JOIN task t ON t.id=${input.taskId}
    WHERE p.id=${input.proposalId} AND t.isDraft=0 AND (${association})
      AND (t.featureId IS p.featureId OR (p.kind='create' AND p.status='accepted' AND EXISTS(SELECT 1 FROM featureRevisionReview decision WHERE decision.proposalId=p.id AND decision.action='accepted' AND decision.featureId=t.featureId))) AND (${input.guard})`
      : sql`
    SELECT p.id,p.candidateRevisionId version,p.featureId,p.status,c.content changes,r.content base,
      COALESCE(h.publishedRevisionId,${privateHead},(SELECT previousRevisionId FROM featureRevisionPublication WHERE featureId=p.featureId AND generation=h.generation),p.baseRevisionId) currentRevisionId,
      EXISTS(SELECT 1 FROM featureInitialRevision initial WHERE initial.featureId=p.featureId AND initial.proposalId=p.id) initialProposal,h.generation currentGeneration
    FROM featureRevisionProposal p JOIN featureRevision r ON r.id=p.baseRevisionId
    JOIN featureRevision c ON c.id=p.candidateRevisionId JOIN featureRevisionHead h ON h.featureId=p.featureId
    JOIN task t ON t.id=${input.taskId} AND t.featureId=p.featureId
    WHERE p.id=${input.proposalId} AND t.isDraft=0
      AND (h.state='active' OR (t.isReviewed=1 AND p.status IN ('accepted','rejected')))
      AND (${association}) AND (${input.guard})`,
  )
  if (!row) return null
  let submitted: FeatureRevisionContent
  if (!lifecycle)
    submitted = FeatureRevisionContentSchema.parse(JSON.parse(row.changes))
  else if (row.featureId) {
    const base = FeatureRevisionContentSchema.parse(JSON.parse(row.base!))
    const result = applyFeatureChanges(
      base,
      base,
      FeatureChangesSchema.parse(JSON.parse(row.changes)),
    )
    if (result.status !== 'ready') throw new Error('Invalid submitted gallery')
    submitted = result.content
  } else submitted = FeatureRevisionContentSchema.parse(JSON.parse(row.changes).content)
  const saved = await db.get<{
    id: string
    context: string
    comparedRevisionId: string | null
    proposalVersion: string
  }>(sql`
    SELECT id,context,comparedRevisionId,${lifecycle ? sql`proposalVersion` : sql`candidateRevisionId`} proposalVersion FROM featureRevisionReview
    WHERE proposalId=${row.id} AND json_extract(context,'$.kind')='image-review/v1'
      AND json_extract(context,'$.taskId')=${input.taskId} ORDER BY rowid DESC LIMIT 1`)
  const context = saved ? reviewContext.parse(JSON.parse(saved.context)) : null
  const content = structuredClone(submitted)
  if (context)
    content.gallery = FeatureRevisionContentSchema.parse({
      ...content,
      gallery: context.gallery,
    }).gallery
  const parent = await db.get<{ projectId: string }>(
    sql`SELECT projectId FROM task WHERE id=${input.taskId}`,
  )
  const policy = row.featureId
    ? await readFeatureImageIntentPolicy(db, row.featureId)
    : await readImageIntentPolicy(db, { type: 'project', id: parent!.projectId })
  const baseline = row.base
    ? FeatureRevisionContentSchema.parse(JSON.parse(row.base))
    : null
  const imageIds = submitted.gallery.order.filter(
    id =>
      !baseline ||
      row.initialProposal ||
      JSON.stringify(baseline.gallery.entries[id]) !==
        JSON.stringify(submitted.gallery.entries[id]),
  )
  const images: FeatureImageReview['images'] = {}
  for (const [imageId, entry] of Object.entries(content.gallery.entries)) {
    const pin = await db.get<{
      metadata: string
      createdAt: string
      contributorId: string | null
    }>(
      sql`SELECT r.metadata,i.createdAt,i.contributorId FROM imageRevision r JOIN image i ON i.id=r.imageId WHERE r.id=${entry.imageRevisionId} AND r.imageId=${imageId}`,
    )
    if (!pin) throw new Error('Review image revision is unavailable')
    const originalRevisionId =
      submitted.gallery.entries[imageId]?.imageRevisionId ?? entry.imageRevisionId
    const original = await db.get<{ metadata: string }>(
      sql`SELECT metadata FROM imageRevision WHERE id=${originalRevisionId} AND imageId=${imageId}`,
    )
    images[imageId] = {
      createdAt: pin.createdAt,
      contributorId: pin.contributorId,
      metadata: JSON.parse(pin.metadata),
      originalMetadata: JSON.parse(original?.metadata ?? pin.metadata),
      originalRevisionId,
    }
  }
  const comparisonGuard =
    row.featureId === null
      ? sql`1`
      : lifecycle
        ? sql`EXISTS(SELECT 1 FROM feature WHERE id=${row.featureId} AND currentRevisionId IS ${row.currentRevisionId} AND revisionVersion=${row.currentGeneration})`
        : sql`EXISTS(SELECT 1 FROM featureRevisionHead h JOIN featureRevisionProposal p ON p.featureId=h.featureId AND p.id=${row.id}
      WHERE h.featureId=${row.featureId} AND h.generation=${row.currentGeneration} AND h.state='active'
      AND COALESCE(h.publishedRevisionId,${privateHead},(SELECT previousRevisionId FROM featureRevisionPublication WHERE featureId=p.featureId AND generation=h.generation),p.baseRevisionId) IS ${row.currentRevisionId})`
  return {
    comparisonGuard,
    intentOrder: policy.intents.map(intent => intent.id),
    imageIds,
    lifecycle,
    currentGeneration: row.currentGeneration,
    proposalId: row.id,
    proposalVersion: row.version,
    featureId: row.featureId,
    taskId: input.taskId,
    reviewId: saved?.id ?? null,
    comparedRevisionId: saved ? saved.comparedRevisionId : row.currentRevisionId,
    currentRevisionId: row.currentRevisionId,
    initialProposal: Boolean(row.initialProposal),
    content,
    submitted,
    excluded: context?.excluded ?? [],
    status: row.status,
    // Completed decisions retain their historical baseline; only pending reviews can become stale.
    stale: Boolean(
      row.status === 'submitted' &&
        saved &&
        (saved.proposalVersion !== row.version ||
          saved.comparedRevisionId !== row.currentRevisionId ||
          context?.comparedGeneration !== row.currentGeneration),
    ),
    images,
  }
}

/** Fence the exact submitted proposal, review version and accepted target seen by the reviewer.
 * @param review Inspected review. @param guard Current authorization scope.
 * @returns Predicate to execute in the same transaction as the mutation or acceptance.
 */
export function featureImageReviewGuard(review: FeatureImageReview, guard: SQL): SQL {
  return sql`(${guard}) AND EXISTS(SELECT 1 FROM task WHERE id=${review.taskId} AND isDraft=0 AND isReviewed=0)
    AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${review.proposalId} AND ${review.lifecycle ? sql`version` : sql`candidateRevisionId`}=${review.proposalVersion} AND status='submitted')
    AND (SELECT id FROM featureRevisionReview WHERE proposalId=${review.proposalId}
      AND json_extract(context,'$.kind')='image-review/v1' AND json_extract(context,'$.taskId')=${review.taskId}
      ORDER BY rowid DESC LIMIT 1) IS ${review.reviewId}
    AND (${review.comparisonGuard})`
}

/** Save an attributed review version without changing the submitted proposal or live gallery.
 * @param db Request database. @param input Exact review tokens, allowlisted edit and optional verified replacement.
 * @returns New immutable review ID, or null for stale input.
 * @remarks Replacement bytes must already exist under a fresh immutable object key.
 */
export async function saveFeatureImageReview(
  db: Database,
  input: {
    taskId: string
    proposalId: string
    proposalVersion: string
    expectedReviewId: string | null
    expectedGeneration?: number
    expectedRevisionId: string | null
    actorId: string
    guard: SQL
    patch: z.infer<typeof ImageReviewPatchSchema>
    refresh?: boolean
    replacement?: {
      storageNamespace: string
      storageKey: string
      contentHash: string
      mediaType: string
      byteSize: number
    }
  },
): Promise<string | null> {
  const review = await readFeatureImageReview(db, input)
  if (
    !review ||
    review.status !== 'submitted' ||
    (review.stale && !input.refresh) ||
    review.proposalVersion !== input.proposalVersion ||
    review.reviewId !== input.expectedReviewId ||
    review.currentRevisionId !== input.expectedRevisionId ||
    (input.expectedGeneration !== undefined &&
      review.currentGeneration !== input.expectedGeneration)
  )
    return null
  const patch = ImageReviewPatchSchema.parse(input.patch)
  let content = structuredClone(review.content)
  // Refresh explicitly compares pending changes with the new accepted head before enabling acceptance again.
  if (input.refresh && review.featureId) {
    const source = await db.get<{
      base: string
      current: string
      reviewedVersion: string | null
    }>(sql`
      SELECT b.content base,c.content current,(SELECT ${review.lifecycle ? sql`proposalVersion` : sql`candidateRevisionId`} FROM featureRevisionReview WHERE id=${review.reviewId}) reviewedVersion
      FROM featureRevisionProposal p JOIN featureRevision b ON b.id=p.baseRevisionId
      JOIN featureRevision c ON c.id=${review.currentRevisionId} AND c.featureId=p.featureId WHERE p.id=${review.proposalId}`)
    if (
      !source ||
      (source.reviewedVersion && source.reviewedVersion !== review.proposalVersion)
    )
      return null
    const base = FeatureRevisionContentSchema.parse(JSON.parse(source.base))
    const merged = applyFeatureChanges(
      base,
      FeatureRevisionContentSchema.parse(JSON.parse(source.current)),
      reviewedImageChanges(base, review),
    )
    if (merged.status !== 'ready')
      throw new Error(
        'Image changes conflict with the current Feature; resolve the proposal before accepting',
      )
    content = merged.content
    for (const id of review.excluded) {
      content.gallery.entries[id] = review.content.gallery.entries[id]
      if (!content.gallery.order.includes(id)) content.gallery.order.push(id)
    }
  }
  const entry = content.gallery.entries[patch.imageId]
  if (!entry) throw new Error('Image does not belong to this review')
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: 'Task image review edited',
  })
  const statements: BatchItem<'sqlite'>[] = [change.statement]
  // Metadata revisions branch from the displayed review pin; submitted and shared pins never move.
  if (
    patch.rotation !== undefined ||
    patch.presentationMode !== undefined ||
    input.replacement
  ) {
    const source = await db.get<{
      assetVersionId: string
      metadata: string
    }>(sql`SELECT assetVersionId,metadata FROM imageRevision
      WHERE id=${entry.imageRevisionId} AND imageId=${patch.imageId}`)
    if (!source) throw new Error('Image revision missing')
    const previous = JSON.parse(source.metadata)
    const metadata = input.replacement
      ? {
          version: previous.version,
          presentationMode: previous.presentationMode,
          contentHash: input.replacement.contentHash,
          sourceRotation: 0,
          rotation: 0,
          renderRotation: 0,
        }
      : previous
    if (patch.rotation !== undefined) {
      metadata.rotation = (Number(metadata.sourceRotation ?? 0) + patch.rotation) % 360
      metadata.renderRotation = patch.rotation
    }
    if (patch.presentationMode !== undefined)
      metadata.presentationMode = patch.presentationMode
    metadata.version = Math.max(Date.now(), Number(metadata.version ?? 0) + 1)
    const assetVersionId = input.replacement
      ? crypto.randomUUID()
      : source.assetVersionId
    if (input.replacement)
      statements.push(
        db.insert(imageAssetVersion).values({
          id: assetVersionId,
          imageId: patch.imageId,
          ...input.replacement,
          changeSetId: change.id,
        }),
      )
    const id = crypto.randomUUID()
    statements.push(
      db.insert(imageRevision).values({
        id,
        imageId: patch.imageId,
        assetVersionId,
        previousRevisionId: entry.imageRevisionId,
        metadata,
        changeSetId: change.id,
      }),
    )
    entry.imageRevisionId = id
  }
  let intentGuard: SQL = sql`1`
  if (patch.intent !== undefined) {
    const parent = await db.get<{ projectId: string }>(
      sql`SELECT projectId FROM task WHERE id=${review.taskId}`,
    )
    if (!parent) return null
    const policy = review.featureId
      ? await readFeatureImageIntentPolicy(db, review.featureId)
      : await readImageIntentPolicy(db, { type: 'project', id: parent.projectId })
    intentGuard = policy.guard
    Object.assign(entry, resolvePolicyImageIntent(policy, patch.intent))
    if (patch.intent === 'canonical')
      for (const [id, other] of Object.entries(content.gallery.entries))
        if (id !== patch.imageId && other.intent === 'canonical')
          other.intent = 'general'
  }
  // Reviewers select intents; visibility is derived again against current policy at acceptance.
  if (patch.caption !== undefined) entry.caption = patch.caption
  if (patch.alt !== undefined) entry.alt = patch.alt
  if (patch.order) content.gallery.order = patch.order
  if (patch.sortMode) content.gallery.sortMode = patch.sortMode
  const excluded = new Set(review.excluded)
  if (patch.included === false) excluded.add(patch.imageId)
  if (patch.included === true) excluded.delete(patch.imageId)
  FeatureRevisionContentSchema.parse(content)
  const id = crypto.randomUUID()
  const context = JSON.stringify({
    kind: 'image-review/v1',
    taskId: input.taskId,
    comparedGeneration: review.currentGeneration,
    previousReviewId: review.reviewId,
    gallery: content.gallery,
    excluded: [...excluded],
  })
  const common = {
    id,
    proposalId: review.proposalId,
    comparedRevisionId: review.currentRevisionId,
    action: 'saved' as const,
    changeSetId: change.id,
    context,
  }
  if (review.lifecycle) {
    const proposal = await db.get<{ changes: string }>(
      sql`SELECT changes FROM featureRevisionProposal WHERE id=${review.proposalId}`,
    )
    statements.push(
      db.insert(partialFeatureReview).values({
        ...common,
        featureId: review.featureId,
        proposalVersion: review.proposalVersion,
        changes: proposal!.changes,
      }),
    )
  } else
    statements.push(
      db.insert(legacyImageReview).values({
        ...common,
        featureId: review.featureId!,
        candidateRevisionId: review.proposalVersion,
      }),
    )
  return (await executeRevisionBatch(
    db,
    featureImageReviewGuard(review, sql`(${input.guard}) AND (${intentGuard})`),
    statements,
  ))
    ? id
    : null
}

/** Materialize only the reviewed gallery; frozen submission and excluded evidence remain retained.
 * @param review Exact inspected review snapshot. @returns Accepted candidate content.
 */
export function reviewedImageContent(
  review: FeatureImageReview,
  base?: FeatureRevisionContent,
): FeatureRevisionContent {
  const content = structuredClone(review.content)
  for (const id of review.excluded) delete content.gallery.entries[id]
  content.gallery.order = content.gallery.order.filter(
    id => !review.excluded.includes(id),
  )
  content.gallery.order = orderGallery(
    content.gallery.order.map((id, position) => ({
      id,
      intent: content.gallery.entries[id].intent,
      createdAt: review.images[id]?.createdAt,
      galleryPosition: position,
    })),
    content.gallery.sortMode,
    review.intentOrder,
  ).map(item => item.id)
  if (base && review.featureId && !review.initialProposal) {
    content.gallery.sortMode = base.gallery.sortMode
    content.gallery.order = [
      ...base.gallery.order.filter(id => Object.hasOwn(content.gallery.entries, id)),
      ...content.gallery.order.filter(id => !Object.hasOwn(base.gallery.entries, id)),
    ]
  }
  return FeatureRevisionContentSchema.parse(content)
}

/** Build a reviewed partial change set against the contributor's original immutable base.
 * @param base Original proposal base. @param review Exact reviewer snapshot.
 * @returns Partial changes for the existing conflict-aware acceptance path.
 */
export function reviewedImageChanges(
  base: FeatureRevisionContent,
  review: FeatureImageReview,
): ReturnType<typeof buildFeatureChanges> {
  // Existing accepted positions and mode survive; reviewed additions append in submission order.
  const content = reviewedImageContent(review, base)
  return buildFeatureChanges(base, content)
}

/** Resolve the exact review token for acceptance, rejecting callers that did not inspect saved edits.
 * @param db Request database. @param proposalId Frozen proposal. @param token Client-inspected review reference. @param guard Current authority.
 * @returns Review and atomic fence; null denotes stale or omitted evidence.
 */
export async function prepareImageReviewAcceptance(
  db: Database,
  proposalId: string,
  token:
    | { taskId: string; reviewId: string | null; proposalVersion?: string }
    | undefined,
  guard: SQL,
) {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM pragma_table_info('featureRevisionReview') WHERE name='context'`,
  )
  if (!storage?.n) return token ? null : { review: null, guard }
  const saved = await db.get<{
    id: string
  }>(sql`SELECT id FROM featureRevisionReview WHERE proposalId=${proposalId}
    AND json_extract(context,'$.kind')='image-review/v1' ORDER BY rowid DESC LIMIT 1`)
  if (!token)
    return saved
      ? null
      : {
          review: null,
          guard: sql`(${guard}) AND NOT EXISTS(SELECT 1 FROM featureRevisionReview
    WHERE proposalId=${proposalId} AND json_extract(context,'$.kind')='image-review/v1')`,
        }
  const review = await readFeatureImageReview(db, {
    taskId: token.taskId,
    proposalId,
    guard,
  })
  if (
    !review ||
    review.stale ||
    review.status !== 'submitted' ||
    review.reviewId !== token.reviewId ||
    (token.proposalVersion !== undefined &&
      token.proposalVersion !== review.proposalVersion) ||
    (saved && saved.id !== review.reviewId)
  )
    return null
  return { review, guard: featureImageReviewGuard(review, guard) }
}

/** Resolve task/proposal membership in both supported persistence schemas.
 * @param db Request database. @returns Predicate for proposal alias p and task alias t.
 */
export async function imageReviewProposalAssociation(db: Database): Promise<SQL> {
  if (await hasFeatureLifecycleStorage(db))
    return sql`(t.proposalId=p.id OR (t.type!='newFeature' AND EXISTS(
    SELECT 1 FROM featureUploadEvidence u,json_each(u.taskIds) j WHERE u.proposalId=p.id AND j.value=t.id)))`
  return sql`(EXISTS(SELECT 1 FROM featureInitialRevision initial WHERE initial.featureId=t.featureId AND initial.proposalId=p.id AND t.type='newFeature')
    OR (t.type!='newFeature' AND EXISTS(SELECT 1 FROM featureImageUploadRevision u,json_each(u.taskIds) j WHERE u.proposalId=p.id AND j.value=t.id)))`
}
