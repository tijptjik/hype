// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
// DOMAIN
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// SCHEMA
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
// SERVICES
import { prepareFeatureEdit } from './featureLifecycle'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureEditCommand } from './featureLifecycle'

const metadataSchema = ImageMetadataFullSchema.extend({
  version: z.number().int().positive(),
  presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional(),
})
const assetSchema = z.strictObject({
  storageNamespace: z.string().min(1),
  storageKey: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.string().startsWith('image/'),
  byteSize: z.number().int().positive(),
})

/** Save a staff image change directly while retaining all previously referenced bytes and metadata.
 * @param db Request database. @param input Inspected Feature/image pins, authorized metadata and optional verified replacement object.
 * @returns Accepted Feature/image revision IDs or null for stale evidence.
 * @remarks Upload verification happens before this call. A replacement must have a new immutable object key.
 * Metadata-only edits reuse the asset version. This transaction never deletes or overwrites an object.
 */
export async function saveLifecycleImageChange(
  db: Database,
  input: Omit<FeatureEditCommand, 'derive' | 'state'> & {
    imageId: string
    expectedImageRevisionId: string
    deriveMetadata: (
      metadata: z.infer<typeof metadataSchema>,
    ) => z.infer<typeof metadataSchema>
    replacement?: z.infer<typeof assetSchema>
  },
): Promise<{
  revisionId: string
  imageRevisionId: string
  assetVersionId: string
} | null> {
  const previous = await db.get<{
    assetVersionId: string
    metadata: string
    storageNamespace: string
    storageKey: string
  }>(sql`
  SELECT r.assetVersionId,r.metadata,a.storageNamespace,a.storageKey FROM imageRevision r
  JOIN imageAssetVersion a ON a.id=r.assetVersionId AND a.imageId=r.imageId
  JOIN featureRevisionImage pin ON pin.imageId=r.imageId AND pin.imageRevisionId=r.id
  WHERE pin.featureRevisionId=${input.expectedRevisionId} AND r.imageId=${input.imageId} AND r.id=${input.expectedImageRevisionId}
  AND (${input.guard})`)
  if (!previous) return null
  const metadata = metadataSchema.parse(
    input.deriveMetadata(metadataSchema.parse(JSON.parse(previous.metadata))),
  )
  const replacement = input.replacement ? assetSchema.parse(input.replacement) : null
  if (
    replacement?.storageNamespace === previous.storageNamespace &&
    replacement.storageKey === previous.storageKey
  )
    throw new Error('Image replacement requires a new immutable object key')
  const imageRevisionId = crypto.randomUUID(),
    assetVersionId = replacement ? crypto.randomUUID() : previous.assetVersionId
  const edit = await prepareFeatureEdit(db, {
    ...input,
    derive: content => {
      const entry = content.gallery.entries[input.imageId]
      if (!entry || entry.imageRevisionId !== input.expectedImageRevisionId)
        throw new Error('Refresh the image before editing')
      entry.imageRevisionId = imageRevisionId
      return content
    },
  })
  if (!edit) return null
  const change = prepareRevisionChangeSet(db, input)
  return (await executeRevisionBatch(db, edit.guard, [
    change.statement,
    ...(replacement
      ? [
          db.insert(imageAssetVersion).values({
            id: assetVersionId,
            imageId: input.imageId,
            ...replacement,
            changeSetId: change.id,
          }),
        ]
      : []),
    db.insert(imageRevision).values({
      id: imageRevisionId,
      imageId: input.imageId,
      previousRevisionId: input.expectedImageRevisionId,
      assetVersionId,
      metadata,
      changeSetId: change.id,
    }),
    ...edit.statements,
  ]))
    ? { revisionId: edit.revisionId, imageRevisionId, assetVersionId }
    : null
}
