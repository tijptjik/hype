// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { privateFeatureComparison } from './featurePrivateCapture'
// IMAGE PRESENTATION
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// TYPES
import type { Database } from '#lib/types.js'

const pinSchema = z.object({
  imageId: z.string(),
  imageRevisionId: z.string(),
  storageNamespace: z.enum(['local', 'preview', 'production']),
  storageKey: z.string(),
  contentHash: z.string(),
  metadata: z.object({
    version: z.number().int().positive(),
    presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional(),
  }),
})

/**
 * Replaces mutable image locators/order with exact accepted gallery pins for hydrated Features.
 * @param db Request database.
 * @param rows Already-authorized Feature rows with their currently visible image relations.
 * @param options Whether this is public delivery, which requires the accepted publication intent too.
 * @returns The same shape with pinned image metadata and explicit gallery ordering.
 * @remarks Live visibility/moderation filters remain in force. Missing or unsupported
 * pins fail closed instead of showing another version. No proposal content is read.
 */
export async function applyFeatureGalleryPins<T extends Record<string, unknown>>(
  db: Database,
  rows: T[],
  options: { publishedOnly?: boolean } = {},
): Promise<T[]> {
  const ids = rows
    .filter(row => typeof row.id === 'string' && Array.isArray(row.images))
    .map(row => row.id)
  if (!ids.length) return rows
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`,
  )
  const lifecycle = await hasFeatureLifecycleStorage(db)
  if (!storage?.n && !lifecycle) return rows
  const privateComparison = await privateFeatureComparison(db, sql`h.featureId`, sql`h.generation`)
  const source = lifecycle ? sql`feature h LEFT JOIN featureRevision r ON r.id=h.currentRevisionId AND r.featureId=h.id
    AND (${Number(!options.publishedOnly)} OR (h.isPublished=1 AND h.isArchived=0))` : sql`featureRevisionHead h
    LEFT JOIN featureRevisionPublication p ON p.featureId=h.featureId AND p.generation=h.generation
    LEFT JOIN featureRevision r ON r.id=CASE WHEN ${Number(Boolean(options.publishedOnly))}=1 THEN h.publishedRevisionId
      ELSE COALESCE(h.publishedRevisionId,${privateComparison},p.previousRevisionId,
        (SELECT initial.id FROM featureRevision initial JOIN featureRevisionPublication receipt
          ON receipt.featureId=initial.featureId AND receipt.changeSetId=initial.changeSetId AND receipt.generation=0
          WHERE initial.featureId=h.featureId AND initial.previousRevisionId IS NULL)) END AND r.featureId=h.featureId AND h.state='active'`
  const identity = lifecycle ? sql`h.id` : sql`h.featureId`
  const accepted = await db.all<{
    featureId: string
    content: string | null
    pins: string
  }>(sql`
    SELECT ${identity} featureId,r.content,COALESCE((SELECT json_group_array(json_object(
      'imageId',pin.imageId,'imageRevisionId',ir.id,'storageNamespace',av.storageNamespace,
      'storageKey',av.storageKey,'contentHash',av.contentHash,'metadata',json(ir.metadata)))
      FROM featureRevisionImage pin JOIN imageRevision ir ON ir.id=pin.imageRevisionId AND ir.imageId=pin.imageId
      JOIN imageAssetVersion av ON av.id=ir.assetVersionId AND av.imageId=ir.imageId
      JOIN image i ON i.id=ir.imageId AND i.isArchived=0
      WHERE pin.featureRevisionId=r.id),'[]') AS pins
    FROM ${source}
    WHERE ${identity} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
  const byFeature = new Map(accepted.map(row => [row.featureId, row]))
  return rows.map(row => {
    const accepted = byFeature.get(String(row.id))
    if (!accepted) return row
    const content = FeatureRevisionContentSchema.safeParse(
      accepted.content && JSON.parse(accepted.content),
    )
    if (!content.success) return { ...row, images: [] }
    const pins = new Map<string, z.infer<typeof pinSchema>>()
    for (const value of JSON.parse(accepted.pins)) {
      const pin = pinSchema.safeParse(value)
      if (pin.success) pins.set(pin.data.imageId, pin.data)
    }
    const images = new Map(
      (row.images as Record<string, unknown>[]).map(link => [
        String(link.imageId),
        link,
      ]),
    )
    const ordered: Record<string, unknown>[] = []
    // Preserve caller filtering: a historical pin cannot restore a removed live assignment.
    for (const [position, imageId] of content.data.gallery.order.entries()) {
      const link = images.get(imageId),
        pin = pins.get(imageId)
      const image = link?.image
      if (!link || !pin || !image || typeof image !== 'object' || Array.isArray(image))
        continue
      const entry = content.data.gallery.entries[imageId]
      if (options.publishedOnly && (!entry.isPublished || entry.intent === 'research' || !link.isPublished)) continue
      ordered.push({
        ...link,
        intent: entry.intent,
        isPublished: Boolean(link.isPublished && entry.isPublished),
        image: {
          ...image,
          publicId: pin.storageKey,
          env: pin.storageNamespace,
          version: pin.metadata.version,
          contentHash: pin.contentHash,
          presentationMode: pin.metadata.presentationMode ?? 'contain',
          imageRevisionId: pin.imageRevisionId,
          galleryPosition: position,
          galleryCaption: entry.caption,
          galleryAlt: entry.alt,
        },
      })
    }
    return { ...row, images: ordered }
  })
}
