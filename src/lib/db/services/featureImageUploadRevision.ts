// DRIZZLE
import { and, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SCHEMA
import { lifecycleUploadEvidence } from '../schema/featureLifecycle.target'
import { image } from '../schema/image'
import { task, taskImage } from '../schema/task'
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
import { featureImageUploadRevision } from '../schema/featureImageUploadRevision'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { saveDirectFeatureUpload, type AcceptedFeatureUpload } from './featureLifecycleUpload'
import { featureUploadEvidenceSource } from './featureUploadEvidence'
import { getUploadedImageId } from './image'
import { readFeatureRevisionWorkspace } from './featureRevisionWorkspace'
import { prepareFeatureRevisionProposal, prepareRevisionChangeSet } from './featureRevision'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { prepareTaskEvidenceRevision } from './taskEvidenceRevision'
// IMAGE PRESENTATION
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './featureRevision'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

// TABLE OF CONTENTS
// 1. Upload finalization and replay
// 2. Reviewed attachment grants

const metadataSchema = ImageMetadataFullSchema.extend({
  version: z.number().int().positive(), presentationMode: z.enum(IMAGE_PRESENTATION_MODES).default('contain'),
})

/**
 * Detects enrollment without treating missing authorization as a legacy identity.
 * @param db Request database.
 * @param featureId Feature identity.
 * @returns Whether revision writers must handle this identity, including retired heads.
 */
export async function hasFeatureRevisionHead(db: Database, featureId: string): Promise<boolean> {
  if(await hasFeatureLifecycleStorage(db))return Boolean(await db.get(sql`SELECT 1 FROM feature WHERE id=${featureId} AND currentRevisionId IS NOT NULL`))
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`)
  return Boolean(storage?.n && await db.get(sql`SELECT 1 FROM featureRevisionHead WHERE featureId=${featureId}`))
}
export type FeatureUploadReceipt = {
  proposalId: string; candidateRevisionId: string; imageId: string; imageRevisionId: string
  assetVersionId: string; replayed: boolean
}

/**
 * Finalizes verified bytes, immutable metadata, task evidence and a private gallery proposal together.
 * @param db Request database.
 * @param input Authorized Feature, server-read bytes, task scopes and exact replacement pin.
 * @returns Durable receipt, legacy routing, or an error for stale/retired scope.
 * @remarks Never writes featureImage, image sidecars or existing image identities. Object keys
 * arbitrate retries; a replay returns the original proposal even if another draft was accepted.
 */
export async function saveFeatureImageUploadDraft(db: Database, input: RevisionCommand & {
  featureId: string; storageNamespace: 'local' | 'preview' | 'production'; storageKey: string
  mediaType: string; bytes: ArrayBuffer; taskIds: string[]; draftContributor: boolean
  replacement?: { imageId: string; imageRevisionId: string }
  deriveMetadata: (previous: z.infer<typeof metadataSchema> | null) => z.infer<typeof metadataSchema>
  intent: FeatureRevisionContent['gallery']['entries'][string]['intent']
}): Promise<{ status: 'legacy' } | AcceptedFeatureUpload | ({ status: 'saved' } & FeatureUploadReceipt)> {
  const lifecycle=await hasFeatureLifecycleStorage(db)
  const evidence=await featureUploadEvidenceSource(db)
  const workspace = await readFeatureRevisionWorkspace(db, { ...input, canPublish: false })
  if (!workspace.enabled) {
    const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`)
    if (storage?.n && await db.get(sql`SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId}`))
      throw new Error('Feature upload scope is unavailable')
    return { status: 'legacy' }
  }
  if (workspace.state !== 'active' || !workspace.comparisonRevisionId)
    throw new Error('Retired Features cannot receive uploads')
  if (input.bytes.byteLength > 20 * 1024 * 1024 || !input.bytes.byteLength || !/^image\/(png|jpeg|webp|avif|gif)$/.test(input.mediaType))
    throw new Error('Unsupported image upload bytes')
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input.bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  const taskIds = [...new Set(input.taskIds)].sort(), requested = JSON.stringify(taskIds)
  if(lifecycle&&!input.draftContributor&&!taskIds.length)return saveDirectFeatureUpload(db,{...input,hash,
    expectedRevisionId:workspace.comparisonRevisionId,expectedVersion:workspace.generation})
  /** Reads a durable same-request receipt, including a winner committed during this request.
   * @returns Original receipt when the actor, bytes, media and task scope match exactly.
   */
  const replay = async (): Promise<({ status: 'saved' } & FeatureUploadReceipt) | null> => {
  const existing = await db.get<FeatureUploadReceipt & { actorId: string; contentHash: string; taskIds: string; mediaType: string }>(sql`
    SELECT u.*,a.contentHash,a.mediaType FROM ${evidence} u JOIN imageAssetVersion a ON a.id=u.assetVersionId
    WHERE a.storageNamespace=${input.storageNamespace} AND a.storageKey=${input.storageKey}
      AND u.featureId=${input.featureId} AND (${input.guard})`)
  if (existing) {
    if (existing.actorId !== input.actorId || existing.contentHash !== hash || existing.mediaType !== input.mediaType ||
      existing.taskIds !== requested || (input.replacement && existing.imageId !== input.replacement.imageId))
      throw new Error('Upload confirmation differs from its original receipt')
    return { status: 'saved', proposalId: existing.proposalId, candidateRevisionId: existing.candidateRevisionId,
      imageId: existing.imageId, imageRevisionId: existing.imageRevisionId, assetVersionId: existing.assetVersionId, replayed: true }
  }
    return null
  }
  const existing = await replay()
  if (existing) return existing
  if (input.draftContributor && !taskIds.length) throw new Error('Contributor uploads require draft task evidence')
  if (input.replacement && taskIds.length) throw new Error('Replace gallery photos separately from task evidence uploads')
  const row = await db.get<{ content: string }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${workspace.comparisonRevisionId} AND (${input.guard})`)
  if (!row) throw new Error('Feature changed; refresh before uploading')
  const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  let previous: z.infer<typeof metadataSchema> | null = null
  if (input.replacement) {
    if (content.gallery.entries[input.replacement.imageId]?.imageRevisionId !== input.replacement.imageRevisionId)
      throw new Error('Image changed; refresh before replacing')
    const prior = await db.get<{ metadata: string }>(sql`SELECT ir.metadata FROM imageRevision ir JOIN image i ON i.id=ir.imageId
      WHERE ir.id=${input.replacement.imageRevisionId} AND ir.imageId=${input.replacement.imageId} AND i.isArchived=0`)
    if (!prior) throw new Error('Replacement image is unavailable')
    previous = metadataSchema.parse(JSON.parse(prior.metadata))
  }
  const metadata = metadataSchema.parse(input.deriveMetadata(previous))
  const imageId = input.replacement?.imageId ?? await getUploadedImageId({ env: input.storageNamespace, publicId: input.storageKey })
  const assetVersionId = crypto.randomUUID(), imageRevisionId = crypto.randomUUID()
  const change = prepareRevisionChangeSet(db, input)
  const current=lifecycle?sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND isArchived=0
    AND currentRevisionId=${workspace.comparisonRevisionId} AND revisionVersion=${workspace.generation})`:
    sql`EXISTS (SELECT 1 FROM featureRevisionHead h JOIN feature f ON f.id=h.featureId
      WHERE h.featureId=${input.featureId} AND h.state='active' AND f.isArchived=0
        AND h.generation=${workspace.generation} AND h.publishedRevisionId IS ${workspace.publishedRevisionId})`
  const guard = sql`(${input.guard}) AND (${current})
    AND NOT EXISTS (SELECT 1 FROM json_each(${requested}) j WHERE NOT EXISTS (
      SELECT 1 FROM task t JOIN feature f ON f.id=t.featureId WHERE t.id=j.value AND t.featureId=${input.featureId}
        AND t.organisationId=f.organisationId AND t.projectId=f.projectId AND t.isReviewed=0
        AND (${Number(!input.draftContributor)} OR (t.isDraft=1 AND t.contributorId=${input.actorId}))))`
  // Missing-report photos are private research evidence, regardless of the submitted gallery intent.
  const evidenceTasks = taskIds.length ? await db.all<{ id: string; type: string }>(sql`
    SELECT id,type FROM task WHERE id IN (SELECT value FROM json_each(${requested}))`) : []
  const research = evidenceTasks.some(row => row.type === 'reportedMissing')
  const evidenceGuard = sql`NOT EXISTS (SELECT id,type FROM task WHERE id IN (SELECT value FROM json_each(${requested}))
    EXCEPT SELECT json_extract(value,'$.id'),json_extract(value,'$.type') FROM json_each(${JSON.stringify(evidenceTasks)}))`
  // A replacement preserves this Feature's captions, ordering and visibility intent.
  if (input.replacement) content.gallery.entries[imageId].imageRevisionId = imageRevisionId
  else {
    if (!research && input.intent === 'canonical') for (const entry of Object.values(content.gallery.entries))
      if (entry.intent === 'canonical') entry.intent = 'undefined'
    content.gallery.order.push(imageId)
    content.gallery.entries[imageId] = { imageRevisionId, intent: research ? 'research' : input.intent,
      isPublished: !research, caption: {}, alt: {} }
  }
  const proposal = await prepareFeatureRevisionProposal(db, { ...input, guard: and(guard, evidenceGuard)!,
    baseRevisionId: workspace.comparisonRevisionId, content: FeatureRevisionContentSchema.parse(content) })
  const receipt: FeatureUploadReceipt = { proposalId: proposal.proposalId, candidateRevisionId: proposal.candidateRevisionId,
    imageId, imageRevisionId, assetVersionId, replayed: false }
  let result: unknown[] | null
  try {
    result = await executeRevisionBatch(db, proposal.guard, [
    change.statement,
    ...(input.replacement ? [] : [db.insert(image).values({ id: imageId, contributorId: input.actorId,
      cdn: 'cloudflareR2', env: input.storageNamespace, publicId: input.storageKey, contentHash: hash,
      version: metadata.version, presentationMode: metadata.presentationMode })]),
    db.insert(imageAssetVersion).values({ id: assetVersionId, imageId, storageNamespace: input.storageNamespace,
      storageKey: input.storageKey, contentHash: hash, mediaType: input.mediaType,
      byteSize: input.bytes.byteLength, changeSetId: change.id }),
    db.insert(imageRevision).values({ id: imageRevisionId, imageId, assetVersionId,
      previousRevisionId: input.replacement?.imageRevisionId, metadata, changeSetId: change.id }),
    ...proposal.statements,
    ...prepareTaskEvidenceRevision(db, and(sql`${task.id} IN (SELECT value FROM json_each(${requested}))`,
      sql`NOT EXISTS (SELECT 1 FROM taskImage WHERE taskId=${task.id} AND imageId=${imageId})`)!),
    db.insert(taskImage).select(db.select({ taskId: sql<string>`CAST(value AS TEXT)`.as('taskId'),
      imageId: sql<string>`${imageId}`.as('imageId') }).from(sql`json_each(${requested})`).where(sql`1`))
      .onConflictDoNothing({ target: [taskImage.taskId, taskImage.imageId] }),
    lifecycle?db.insert(lifecycleUploadEvidence).values({id:crypto.randomUUID(),featureId:input.featureId,
      proposalId:receipt.proposalId,proposalVersion:receipt.candidateRevisionId,imageId,imageRevisionId,assetVersionId,actorId:input.actorId,taskIds}):
    db.insert(featureImageUploadRevision).values({ id: crypto.randomUUID(), featureId: input.featureId,
      proposalId: receipt.proposalId, candidateRevisionId: receipt.candidateRevisionId,
      imageId, imageRevisionId, assetVersionId, actorId: input.actorId, taskIds }),
    prepareRevisionCheck(db, guard),
  ])
  } catch (cause) {
    // Another confirmation of the same signed object may have won the unique receipt race.
    const committed = await replay()
    if (committed) return committed
    throw cause
  }
  if (!result) {
    const committed = await replay()
    if (committed) return committed
    throw new Error('Feature or task changed; refresh before finalizing')
  }
  return { status: 'saved', ...receipt }
}

/**
 * Resolves exact upload pins a reviewer may attach for this proposal.
 * @param db Request database.
 * @param input Authorized Feature/proposal and current scope predicate.
 * @returns Pin allowlist and transactional evidence guard; no cross-Feature image access is implied.
 */
export async function readFeatureUploadAttachmentGrant(db: Database, input: {
  featureId: string; proposalId: string; guard: SQL
}): Promise<{ pins: ReadonlyMap<string, string>; guard: SQL }> {
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name IN ('featureImageUploadRevision','featureUploadEvidence') AND type='table'`)
  if (!storage?.n) return { pins: new Map(), guard: sql`1` }
  const evidence = await featureUploadEvidenceSource(db)
  const rows = await db.all<{ imageId: string; imageRevisionId: string }>(sql`SELECT imageId,imageRevisionId
    FROM ${evidence} WHERE featureId=${input.featureId} AND proposalId=${input.proposalId} AND (${input.guard})`)
  const pins = new Map(rows.map(row => [row.imageId, row.imageRevisionId]))
  const guard = sql`NOT EXISTS (SELECT 1 FROM ${evidence} u
    JOIN json_each(u.taskIds) j WHERE u.featureId=${input.featureId} AND u.proposalId=${input.proposalId}
      AND NOT EXISTS (SELECT 1 FROM task t JOIN feature f ON f.id=t.featureId
        JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
        WHERE t.id=j.value AND t.featureId=u.featureId AND t.isReviewed=0 AND t.isDraft=0
          AND t.projectId=f.projectId AND t.organisationId=f.organisationId))`
  return { pins, guard }
}
