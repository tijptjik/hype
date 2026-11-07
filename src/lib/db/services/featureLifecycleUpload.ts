// IMAGE INTENT POLICY
import { readFeatureImageIntentPolicy, resolvePolicyImageIntent } from './imageIntentPolicy'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
// SCHEMA
import { image } from '../schema/image'
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
// DOMAIN
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// SERVICES
import { getUploadedImageId } from './image'
import { readCurrentFeatureRevision, prepareFeatureEdit } from './featureLifecycle'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

const metadataSchema = ImageMetadataFullSchema.extend({
  version: z.number().int().positive(),
  presentationMode: z.enum(IMAGE_PRESENTATION_MODES).default('contain'),
})
export type AcceptedFeatureUpload = {
  status: 'accepted'
  revisionId: string
  imageId: string
  imageRevisionId: string
  assetVersionId: string
  replayed: boolean
}

/** Accept a verified staff upload directly, with durable replay evidence in immutable image/Feature history.
 * @param db Request database. @param input Authorized current Feature, verified object bytes/digest and metadata transformation.
 * @returns Exact original accepted receipt, including on an identical retry.
 * @remarks No staff proposal is created. File replacement preserves prior objects and pins, captions and ordering.
 */
export async function saveDirectFeatureUpload(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    expectedRevisionId: string
    expectedVersion: number
    storageNamespace: 'local' | 'preview' | 'production'
    storageKey: string
    mediaType: string
    bytes: ArrayBuffer
    hash: string
    replacement?: { imageId: string; imageRevisionId: string }
    intent: FeatureRevisionContent['gallery']['entries'][string]['intent']
    deriveMetadata: (
      previous: z.infer<typeof metadataSchema> | null,
    ) => z.infer<typeof metadataSchema>
  },
): Promise<AcceptedFeatureUpload> {
  const replay = async (): Promise<AcceptedFeatureUpload | null> => {
    const row = await db.get<{
      revisionId: string
      imageId: string
      imageRevisionId: string
      assetVersionId: string
      actorId: string
      contentHash: string
      mediaType: string
      byteSize: number
    }>(sql`
   SELECT r.id revisionId,ir.imageId,ir.id imageRevisionId,a.id assetVersionId,c.actorId,a.contentHash,a.mediaType,a.byteSize
   FROM imageAssetVersion a JOIN imageRevision ir ON ir.assetVersionId=a.id AND ir.imageId=a.imageId AND ir.changeSetId=a.changeSetId
   JOIN revisionChangeSet c ON c.id=a.changeSetId
   JOIN featureRevisionImage pin ON pin.imageRevisionId=ir.id AND pin.imageId=ir.imageId
   JOIN featureRevision r ON r.id=pin.featureRevisionId AND r.featureId=${input.featureId} AND r.sequence IS NOT NULL
   WHERE a.storageNamespace=${input.storageNamespace} AND a.storageKey=${input.storageKey} AND (${input.guard})
   ORDER BY r.sequence LIMIT 1`)
    if (!row) return null
    if (
      row.actorId !== input.actorId ||
      row.contentHash !== input.hash ||
      row.mediaType !== input.mediaType ||
      row.byteSize !== input.bytes.byteLength ||
      (input.replacement && row.imageId !== input.replacement.imageId)
    )
      throw new Error('Upload confirmation differs from its original acceptance')
    return {
      status: 'accepted',
      revisionId: row.revisionId,
      imageId: row.imageId,
      imageRevisionId: row.imageRevisionId,
      assetVersionId: row.assetVersionId,
      replayed: true,
    }
  }
  const prior = await replay()
  if (prior) return prior
  const current = await readCurrentFeatureRevision(db, input)
  if (
    !current ||
    current.retired ||
    current.revisionId !== input.expectedRevisionId ||
    current.version !== input.expectedVersion
  )
    throw new Error('Feature changed; refresh before uploading')
  let previous: z.infer<typeof metadataSchema> | null = null
  if (input.replacement) {
    if (
      current.content.gallery.entries[input.replacement.imageId]?.imageRevisionId !==
      input.replacement.imageRevisionId
    )
      throw new Error('Image changed; refresh before replacing')
    const row = await db.get<{
      metadata: string
    }>(sql`SELECT ir.metadata FROM imageRevision ir JOIN image i ON i.id=ir.imageId
    WHERE ir.id=${input.replacement.imageRevisionId} AND ir.imageId=${input.replacement.imageId} AND i.isArchived=0`)
    if (!row) throw new Error('Replacement image is unavailable')
    previous = metadataSchema.parse(JSON.parse(row.metadata))
  }
  const metadata = metadataSchema.parse({
    ...input.deriveMetadata(previous),
    contentHash: input.hash,
  })
  const imageId =
    input.replacement?.imageId ??
    (await getUploadedImageId({
      env: input.storageNamespace,
      publicId: input.storageKey,
    }))
  const assetVersionId = crypto.randomUUID(),
    imageRevisionId = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input)
  const imagePolicy = await readFeatureImageIntentPolicy(db, input.featureId)
  const assignment = resolvePolicyImageIntent(imagePolicy, input.intent, imagePolicy.autoPublishUnclassified)
  const prepared = await prepareFeatureEdit(db, {
    ...input,
    guard: sql`(${input.guard}) AND (${imagePolicy.guard})`,
    attachmentGuard: input.guard,
    validate: () => [],
    derive: content => {
      if (input.replacement)
        content.gallery.entries[imageId].imageRevisionId = imageRevisionId
      else {
        if (input.intent === 'canonical')
          for (const entry of Object.values(content.gallery.entries))
            if (entry.intent === 'canonical') { entry.intent = 'general'; entry.isPublished = true }
        content.gallery.order.push(imageId)
        content.gallery.entries[imageId] = {
          imageRevisionId,
          ...assignment,
          caption: {},
          alt: {},
        }
      }
      return content
    },
  })
  if (!prepared) throw new Error('Feature changed; refresh before uploading')
  try {
    const accepted = await executeRevisionBatch(db, prepared.guard, [
      change.statement,
      ...(input.replacement
        ? []
        : [
            db
              .insert(image)
              .values({
                id: imageId,
                contributorId: input.actorId,
                cdn: 'cloudflareR2',
                env: input.storageNamespace,
                publicId: input.storageKey,
                contentHash: input.hash,
                version: metadata.version,
                presentationMode: metadata.presentationMode,
              }),
          ]),
      db
        .insert(imageAssetVersion)
        .values({
          id: assetVersionId,
          imageId,
          storageNamespace: input.storageNamespace,
          storageKey: input.storageKey,
          contentHash: input.hash,
          mediaType: input.mediaType,
          byteSize: input.bytes.byteLength,
          changeSetId: change.id,
        }),
      db
        .insert(imageRevision)
        .values({
          id: imageRevisionId,
          imageId,
          assetVersionId,
          previousRevisionId: input.replacement?.imageRevisionId,
          metadata,
          changeSetId: change.id,
        }),
      ...prepared.statements,
    ])
    if (accepted)
      return {
        status: 'accepted',
        revisionId: prepared.revisionId,
        imageId,
        imageRevisionId,
        assetVersionId,
        replayed: false,
      }
  } catch (cause) {
    const winner = await replay()
    if (winner) return winner
    throw cause
  }
  const winner = await replay()
  if (winner) return winner
  throw new Error('Feature changed; refresh before finalizing')
}
