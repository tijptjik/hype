// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// VALIDATION
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
// SCHEMA
import { image } from '../schema/image'
// SERVICES
import { createImageAssetRevision, createImageMetadataRevision } from './imageRevision'
import { equalRevisionValue } from '#lib/revisions/merge.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Explicit recovery provenance; an empty baseline never claims the missing sidecar was recovered. */
export type ImageMetadataRecovery = {
  kind: 'empty-missing-sidecar'
  missingVersion: number
  reason: string
}

/**
 * Registers a legacy/uploaded image baseline from exact, server-read object evidence.
 * @param db Request database.
 * @param input Authorized captured image locator, original bytes and exact metadata sidecar, or explicitly authorized empty recovery.
 * @returns Immutable revision/asset identifiers, or null if the live image changed while read.
 * @remarks This command never fetches, overwrites or copies remote assets. The caller must
 * read the exact namespace/key and metadata version. Empty recovery requires a confirmed
 * missing sidecar and retained provenance; it is never an implicit fallback. File integrity
 * is computed from bytes rather than trusting submitted hashes. Historical source attribution
 * remains on the image identity; baseline capture has its own migration actor.
 */
export async function registerImageRevisionBaseline(
  db: Database,
  input: RevisionCommand & {
    imageId: string
    expectedModifiedAt: string
    storageNamespace: 'local' | 'preview' | 'production'
    storageKey: string
    expectedVersion: number | null
    bytes: ArrayBuffer
    mediaType: string
    metadata: unknown
    metadataRecovery?: ImageMetadataRecovery
    /** Logo enrollment may record a current presentation setting over identical verified media. */
    captureCurrentPresentation?: boolean
  },
): Promise<{ assetVersionId: string; imageRevisionId: string } | null> {
  const existing = await db
    .select()
    .from(image)
    .where(eq(image.id, input.imageId))
    .get()
  if (
    !existing ||
    existing.cdn !== 'cloudflareR2' ||
    existing.env !== input.storageNamespace ||
    existing.publicId !== input.storageKey ||
    existing.modifiedAt !== input.expectedModifiedAt ||
    existing.version !== input.expectedVersion
  )
    return null
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(input.mediaType))
    throw new Error('Unsupported image media type')
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion ?? 0) < 1)
    throw new Error('An exact positive metadata version is required')
  const recovery = input.metadataRecovery
  if (recovery && (recovery.kind !== 'empty-missing-sidecar' || recovery.missingVersion !== input.expectedVersion ||
      typeof recovery.reason !== 'string' || !recovery.reason.trim() || !input.metadata ||
      typeof input.metadata !== 'object' || Array.isArray(input.metadata) || Object.keys(input.metadata).length))
    throw new Error('Empty metadata recovery requires an empty object, matching version and explicit reason')
  const metadata = ImageMetadataFullSchema.parse(input.metadata)
  const digest = await crypto.subtle.digest('SHA-256', input.bytes)
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  if (existing.contentHash && existing.contentHash.toLowerCase() !== contentHash)
    throw new Error('Image object differs from its recorded content hash')
  if (metadata.contentHash && metadata.contentHash.toLowerCase() !== contentHash)
    throw new Error('Image object differs from its exact metadata content hash')
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM image WHERE id=${input.imageId}
    AND publicId=${input.storageKey} AND env=${input.storageNamespace} AND version IS ${input.expectedVersion}
    AND modifiedAt=${input.expectedModifiedAt} AND contentHash IS ${existing.contentHash} AND presentationMode IS ${existing.presentationMode})`
  const storedMetadata = {
    ...metadata, presentationMode: existing.presentationMode, version: existing.version,
    ...(recovery ? { baselineRecovery: recovery } : {}),
  } as RevisionValue
  // Rehearsal and upload retries may reuse identical evidence, never an object locator with different bytes.
  const registered = await db.all<{ assetVersionId: string; imageRevisionId: string; contentHash: string; byteSize: number; mediaType: string; metadata: string }>(sql`
    SELECT av.id AS assetVersionId,ir.id AS imageRevisionId,av.contentHash,av.byteSize,av.mediaType,ir.metadata
    FROM imageAssetVersion av JOIN imageRevision ir ON ir.assetVersionId=av.id AND ir.imageId=av.imageId
    WHERE av.imageId=${input.imageId} AND av.storageNamespace=${input.storageNamespace} AND av.storageKey=${input.storageKey}
      AND (${guard})`)
  if (registered.length) {
    const match = registered.find(row => row.contentHash === contentHash && row.byteSize === input.bytes.byteLength &&
      row.mediaType === input.mediaType && equalRevisionValue(JSON.parse(row.metadata), storedMetadata))
    if (!match && input.captureCurrentPresentation) {
      // Legacy presentation edits may predate logo recording; retain the old pin and append the current verified setting.
      const previous = registered.find(row => row.contentHash === contentHash && row.byteSize === input.bytes.byteLength &&
        row.mediaType === input.mediaType && equalRevisionValue(
          { ...JSON.parse(row.metadata), presentationMode: existing.presentationMode }, storedMetadata))
      if (previous) {
        const imageRevisionId = await createImageMetadataRevision(db, {
          ...input, guard, origin: 'migration', reason: 'Verified current logo presentation baseline',
          previousRevisionId: previous.imageRevisionId, assetVersionId: previous.assetVersionId, metadata: storedMetadata,
        })
        return imageRevisionId ? { assetVersionId: previous.assetVersionId, imageRevisionId } : null
      }
    }
    if (!match) throw new Error('Image locator is already registered with different evidence; use an explicit image revision')
    return { assetVersionId: match.assetVersionId, imageRevisionId: match.imageRevisionId }
  }
  return createImageAssetRevision(db, {
    ...input,
    guard,
    origin: input.origin ?? 'migration',
    contentHash,
    byteSize: input.bytes.byteLength,
    metadata: storedMetadata,
  })
}
