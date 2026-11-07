// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureImage } from '../schema/image'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionProjection } from './featureRevision'

/**
 * Checks accepted gallery membership without copying image-level metadata into live rows.
 * @param featureId Feature whose gallery is being compared.
 * @param gallery Exact authored membership and local publication intent.
 * @returns Transactional equality predicate; order/captions remain in the immutable head.
 */
export function featureGalleryMatches(
  featureId: string,
  gallery: FeatureRevisionContent['gallery'],
): SQL {
  const entries = JSON.stringify(gallery.entries)
  return sql`(SELECT count(*) FROM featureImage WHERE featureId=${featureId})=
    (SELECT count(*) FROM json_each(${entries})) AND NOT EXISTS (
      SELECT 1 FROM json_each(${entries}) entry WHERE NOT EXISTS (
        SELECT 1 FROM featureImage fi WHERE fi.featureId=${featureId} AND fi.imageId=entry.key
          AND fi.intent=json_extract(entry.value,'$.intent')
          AND COALESCE(fi.localIsPublished,fi.isPublished)=json_extract(entry.value,'$.isPublished')
      ))`
}

/**
 * Prepares gallery replacement as part of a Feature publication transaction.
 * @param db Request database.
 * @param input Server-validated gallery and authority over any newly attached images.
 * @returns Prepared membership writes and verification; no objects or image records are deleted.
 * @remarks The Feature revision is authoritative for order, captions, alt text and image pins.
 * New attachments require a server-owned grant predicate. Existing entries can be removed,
 * reordered or adopt a same-image metadata revision without granting access to another image.
 * Live image moderation remains authoritative even for a historically published entry.
 */
export function prepareFeatureGalleryProjection(
  db: Database,
  input: {
    featureId: string
    previous: FeatureRevisionContent['gallery']
    gallery: FeatureRevisionContent['gallery']
    actorId: string
    publication: Readonly<
      Record<string, { publisherId: string | null; publishedAt: string | null }>
    >
    attachmentGuard?: SQL
  },
): RevisionProjection {
  const additions = Object.keys(input.gallery.entries).filter(
    id => !Object.hasOwn(input.previous.entries, id),
  )
  if (additions.length && !input.attachmentGuard)
    throw new Error('New gallery attachments require current image access')
  const entries = JSON.stringify(input.gallery.entries)
  const references = sql`NOT EXISTS (SELECT 1 FROM json_each(${entries}) entry
    WHERE NOT EXISTS (SELECT 1 FROM imageRevision ir JOIN image i ON i.id=ir.imageId
      JOIN imageAssetVersion av ON av.id=ir.assetVersionId AND av.imageId=i.id
      WHERE ir.id=json_extract(entry.value,'$.imageRevisionId') AND ir.imageId=entry.key
      AND (json_extract(entry.value,'$.isPublished')=0 OR i.isArchived=0)))`
  const statements: RevisionProjection['statements'] = [
    prepareRevisionCheck(
      db,
      sql`(${featureGalleryMatches(input.featureId, input.previous)})
      AND (${references}) AND (${input.attachmentGuard ?? sql`1`})`,
    ),
    db.delete(featureImage).where(eq(featureImage.featureId, input.featureId)),
  ]
  // Replace memberships in one batch so canonical-image uniqueness cannot observe a half-swap.
  for (const imageId of input.gallery.order) {
    const entry = input.gallery.entries[imageId]
    statements.push(
      db.insert(featureImage).values({
        featureId: input.featureId,
        imageId,
        intent: entry.intent,
        localIsPublished: entry.isPublished,
        isPublished: sql`(SELECT isPublished AND NOT isArchived FROM feature WHERE id=${input.featureId}) AND ${Number(entry.isPublished)}`,
        publisherId: entry.isPublished
          ? input.previous.entries[imageId]?.isPublished
            ? (input.publication[imageId]?.publisherId ?? null)
            : input.actorId
          : null,
        publishedAt: entry.isPublished
          ? input.previous.entries[imageId]?.isPublished
            ? (input.publication[imageId]?.publishedAt ?? null)
            : new Date().toISOString()
          : null,
      }),
    )
  }
  return {
    statements,
    verify: sql`(${featureGalleryMatches(input.featureId, input.gallery)}) AND (${references})`,
  }
}
