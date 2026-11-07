// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// SCHEMA
import { image } from '../schema/image'
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
import { task, taskImage } from '../schema/task'
import { lifecycleUploadEvidence } from '../schema/featureLifecycle.target'
// SERVICES
import { readFeatureCreationTask, creationContributionScopeGuard } from './featureLifecycleCreationTask'
import { saveFeatureContributionDraft } from './featureLifecycleContribution'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { prepareTaskEvidenceRevision } from './taskEvidenceRevision'
import { getUploadedImageId } from './image'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureUploadReceipt } from './featureImageUploadRevision'

const metadataSchema = ImageMetadataFullSchema.extend({ version: z.number().int().positive(), presentationMode: z.enum(IMAGE_PRESENTATION_MODES).default('contain') })

/** Attach verified immutable bytes to an author's creation proposal and task without a Feature row.
 * @param db Request database. @param input Authorized task, verified bytes and server-derived metadata.
 * @returns Durable same-object receipt; retries never create duplicate photos or erase another upload.
 * @remarks No mutable sidecar or accepted Feature/gallery is written. Submission freezes the complete proposal.
 */
export async function saveFeatureCreationUpload(db: Database, input: {
  taskId: string; actorId: string; storageNamespace: 'local' | 'preview' | 'production'
  storageKey: string; mediaType: string; bytes: ArrayBuffer; metadata: z.input<typeof metadataSchema>
}): Promise<{ status: 'saved' } & FeatureUploadReceipt> {
  if (!input.bytes.byteLength || input.bytes.byteLength > 20 * 1024 * 1024 || !/^image\/(png|jpeg|webp|avif|gif)$/.test(input.mediaType))
    throw new Error('Unsupported image upload bytes')
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input.bytes)), value => value.toString(16).padStart(2, '0')).join('')
  const metadata = metadataSchema.parse(input.metadata)
  const replay = async (): Promise<({ status: 'saved' } & FeatureUploadReceipt) | null> => {
    const row = await db.get<FeatureUploadReceipt & { actorId: string; contentHash: string; mediaType: string; byteSize: number; taskIds: string }>(sql`
      SELECT u.proposalId,u.proposalVersion candidateRevisionId,u.imageId,u.imageRevisionId,u.assetVersionId,u.actorId,u.taskIds,a.contentHash,a.mediaType,a.byteSize
      FROM featureUploadEvidence u JOIN imageAssetVersion a ON a.id=u.assetVersionId
      WHERE a.storageNamespace=${input.storageNamespace} AND a.storageKey=${input.storageKey}`)
    if (!row) return null
    if (row.actorId !== input.actorId || row.contentHash !== hash || row.mediaType !== input.mediaType || row.byteSize !== input.bytes.byteLength || row.taskIds !== JSON.stringify([input.taskId]))
      throw new Error('Upload confirmation differs from its original receipt')
    return { status: 'saved', proposalId: row.proposalId, candidateRevisionId: row.candidateRevisionId,
      imageId: row.imageId, imageRevisionId: row.imageRevisionId, assetVersionId: row.assetVersionId, replayed: true }
  }
  const imageId = await getUploadedImageId({ env: input.storageNamespace, publicId: input.storageKey })
  // Concurrent photo confirmations serialize through the proposal version; bounded retries reload the whole gallery.
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readFeatureCreationTask(db, { taskId: input.taskId, guard: sql`1` })
    if (!current || current.contributorId !== input.actorId) throw new Error('Contribution draft is unavailable')
    const receipt = await replay()
    if (receipt) return receipt
    if (!current.isDraft || current.isReviewed || current.status !== 'draft') throw new Error('Contribution has already been submitted')
    const assetVersionId = crypto.randomUUID(), imageRevisionId = crypto.randomUUID()
    const change = prepareRevisionChangeSet(db, { actorId: input.actorId, reason: 'Creation contribution photo uploaded' })
    const content = structuredClone(current.content)
    content.gallery.order.push(imageId)
    content.gallery.entries[imageId] = { imageRevisionId, intent: 'undefined', isPublished: true, caption: {}, alt: {} }
    const guard = sql`(${creationContributionScopeGuard(current.scope)}) AND EXISTS(SELECT 1 FROM task
      WHERE id=${input.taskId} AND proposalId=${current.proposalId} AND contributorId=${input.actorId}
      AND modifiedAt=${current.modifiedAt} AND isDraft=1 AND isReviewed=0 AND featureId IS NULL)`
    try {
      const version = await saveFeatureContributionDraft(db, {
        actorId: input.actorId, proposalId: current.proposalId, expectedVersion: current.version, guard,
        payload: { format: 'feature-create/v1', content }, validate: () => [],
        completion: [change.statement,
          db.insert(image).values({ id: imageId, contributorId: input.actorId, cdn: 'cloudflareR2', env: input.storageNamespace,
            publicId: input.storageKey, contentHash: hash, version: metadata.version, presentationMode: metadata.presentationMode }),
          db.insert(imageAssetVersion).values({ id: assetVersionId, imageId, storageNamespace: input.storageNamespace,
            storageKey: input.storageKey, contentHash: hash, mediaType: input.mediaType, byteSize: input.bytes.byteLength, changeSetId: change.id }),
          db.insert(imageRevision).values({ id: imageRevisionId, imageId, assetVersionId, metadata, changeSetId: change.id }),
          ...prepareTaskEvidenceRevision(db, sql`${task.id}=${input.taskId}`),
          db.insert(taskImage).values({ taskId: input.taskId, imageId }),
          db.insert(lifecycleUploadEvidence).values({ id: crypto.randomUUID(), featureId: null,
            proposalId: current.proposalId, proposalVersion: sql`(SELECT version FROM featureRevisionProposal WHERE id=${current.proposalId})`,
            imageId, imageRevisionId, assetVersionId, actorId: input.actorId, taskIds: [input.taskId] }),
        ],
      })
      if (version) return { status: 'saved', proposalId: current.proposalId, candidateRevisionId: version,
        imageId, imageRevisionId, assetVersionId, replayed: false }
    } catch (cause) {
      const committed = await replay()
      if (committed) return committed
      throw cause
    }
  }
  throw new Error('Contribution changed during upload; retry confirmation')
}
