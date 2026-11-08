// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
// SCHEMA
import { imageRevision } from '../schema/imageRevision'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
// SERVICES
import { hasFeatureLifecycleStorage, readCurrentFeatureRevision } from './featureLifecycle'
import { saveLifecycleImageChange } from './featureLifecycleImage'
import { readFeatureRevisionWorkspace } from './featureRevisionWorkspace'
import { prepareRevisionChangeSet } from './featureRevision'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch } from './revisionBatch'
// IMAGE PRESENTATION
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './featureRevision'

const metadataSchema = ImageMetadataFullSchema.extend({
  version: z.number().int().positive(),
  presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional(),
})

/**
 * Applies an immutable metadata edit and its accepted Feature pin in one transaction.
 * @param db Request database.
 * @param input Authorized Feature/image, exact displayed pin and a trusted metadata transformation.
 * @returns Legacy routing or accepted revision identifiers; preserves identity and visibility.
 * @remarks Editing an image used by several Features changes only this Feature's accepted pin.
 * The caller must authorize image editing first. Other Features adopt the revision explicitly.
 * No mutable sidecar or newest-image lookup supplies metadata for an enrolled Feature.
 */
export async function saveFeatureImageMetadata(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    imageId: string
    expectedImageRevisionId?: string
    derive: (metadata: z.infer<typeof metadataSchema>) => z.infer<typeof metadataSchema>
  },
): Promise<{ status: 'legacy' } | {status:'accepted';revisionId:string;imageRevisionId:string;assetVersionId:string}> {
  if(await hasFeatureLifecycleStorage(db)) {
    const current=await readCurrentFeatureRevision(db,input)
    if(!current||!input.expectedImageRevisionId)throw new Error('Refresh the Feature image before editing')
    const saved=await saveLifecycleImageChange(db,{...input,expectedRevisionId:current.revisionId,expectedVersion:current.version,
      expectedImageRevisionId:input.expectedImageRevisionId,deriveMetadata:input.derive,validate:()=>[]})
    if(!saved)throw new Error('Feature image changed; refresh before editing')
    return {status:'accepted',...saved}
  }
  const workspace = await readFeatureRevisionWorkspace(db, { ...input, canPublish: false })
  if (!workspace.enabled) {
    const storage = await db.get<{ n: number }>(sql`SELECT count(*) AS n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`)
    if (storage?.n && await db.get(sql`SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId}`))
      throw new Error('Feature image revision is unavailable')
    return { status: 'legacy' }
  }
  if (workspace.state !== 'active' || !workspace.comparisonRevisionId || !input.expectedImageRevisionId)
    throw new Error('Refresh the Feature image before editing')
  const row = await db.get<{ content: string; metadata: string; assetVersionId: string }>(sql`
    SELECT r.content,ir.metadata,ir.assetVersionId FROM featureRevision r
    JOIN featureRevisionImage pin ON pin.featureRevisionId=r.id AND pin.imageId=${input.imageId}
    JOIN imageRevision ir ON ir.id=pin.imageRevisionId AND ir.imageId=pin.imageId
    JOIN image i ON i.id=ir.imageId AND i.isArchived=0
    WHERE r.id=${workspace.comparisonRevisionId} AND r.featureId=${input.featureId}
      AND ir.id=${input.expectedImageRevisionId} AND (${input.guard})`)
  if (!row) throw new Error('Feature image changed; refresh before editing')
  const metadata = metadataSchema.parse(input.derive(metadataSchema.parse(JSON.parse(row.metadata))))
  const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  const id = crypto.randomUUID(), change = prepareRevisionChangeSet(db, input)
  const previous = structuredClone(content)
  content.gallery.entries[input.imageId].imageRevisionId = id
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead
    WHERE featureId=${input.featureId} AND state='active' AND generation=${workspace.generation}
      AND publishedRevisionId IS ${workspace.publishedRevisionId})
    AND EXISTS (SELECT 1 FROM image WHERE id=${input.imageId} AND isArchived=0)`
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input, guard,
    derive: current => {
      if (!equalRevisionValue(current, previous))
        throw new Error('Feature image changed; refresh before editing')
      return content
    },
  })
  if (!capture.revisionId) throw new Error('Feature image revision is unavailable')
  // Register metadata before the accepted snapshot pin, with both rolled back on failure.
  const result = await executeRevisionBatch(db, guard, [
    ...capture.before,
    change.statement,
    db.insert(imageRevision).values({ id, imageId: input.imageId,
      previousRevisionId: input.expectedImageRevisionId, assetVersionId: row.assetVersionId,
      changeSetId: change.id, metadata }),
    ...capture.after,
  ])
  if (!result) throw new Error('Feature image changed; refresh before editing')
  return { status: 'accepted', revisionId: capture.revisionId,
    imageRevisionId: id, assetVersionId: row.assetVersionId }
}
