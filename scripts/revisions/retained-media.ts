// TYPES
import type { Database } from 'bun:sqlite'
import type { MediaLocator } from './cache-media'
// VALIDATION
import { ImageMetadataFullSchema } from '../../src/lib/db/zod/schema/image'

export type RetainedMetadata = {
  imageRevisionId: string
  metadata: string
  contentHash: string
}

/** Read exact immutable metadata when a legacy sidecar is unavailable.
 * @param db Source snapshot. @param locator Current exact image locator.
 * @returns Unambiguous retained evidence, or undefined when none exists.
 * @remarks Matching versions alone are insufficient: the asset owner, namespace,
 * key and content hash must agree. Conflicting same-version history fails closed.
 */
export function retainedMetadata(
  db: Database,
  locator: MediaLocator,
): RetainedMetadata | undefined {
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE name='imageRevision'").get())
    return undefined
  const rows = db
    .query(
      `SELECT ir.id imageRevisionId,ir.metadata,av.contentHash
    FROM imageRevision ir JOIN imageAssetVersion av ON av.id=ir.assetVersionId AND av.imageId=ir.imageId
    WHERE ir.imageId=? AND av.storageNamespace=? AND av.storageKey=?
      AND json_extract(ir.metadata,'$.version')=? ORDER BY ir.id`,
    )
    .all(
      locator.id,
      locator.env,
      locator.publicId,
      locator.version,
    ) as RetainedMetadata[]
  if (!rows.length) return undefined
  const normalized = rows.map(row => {
    const metadata = ImageMetadataFullSchema.parse(JSON.parse(row.metadata))
    if (
      !/^[a-f0-9]{64}$/i.test(row.contentHash) ||
      [locator.contentHash, metadata.contentHash].some(
        hash => hash && hash.toLowerCase() !== row.contentHash.toLowerCase(),
      )
    )
      throw new Error('Retained metadata asset hash mismatch')
    return JSON.stringify([metadata, row.contentHash.toLowerCase()])
  })
  if (new Set(normalized).size !== 1)
    throw new Error('Ambiguous retained image metadata')
  return rows[0]
}

/** Reuse an exact immutable pin after independently verifying its original bytes.
 * @param db Enrolled snapshot. @param locator Exact current image row.
 * @param evidence Verified file hash, size, media type and parsed sidecar metadata.
 * @returns Existing pin only when current metadata and presentation agree.
 */
export function verifiedRetainedPin(
  db: Database,
  locator: MediaLocator,
  evidence: {
    contentHash: string
    byteSize: number
    mediaType: string
    metadata: unknown
  },
): { imageRevisionId: string; assetVersionId: string } | undefined {
  const retained = retainedMetadata(db, locator)
  if (!retained) return undefined
  const row = db
    .query(
      `SELECT ir.assetVersionId,av.byteSize,av.mediaType,i.presentationMode
    FROM imageRevision ir JOIN imageAssetVersion av ON av.id=ir.assetVersionId
    JOIN image i ON i.id=ir.imageId WHERE ir.id=?`,
    )
    .get(retained.imageRevisionId) as {
    assetVersionId: string
    byteSize: number
    mediaType: string
    presentationMode: string
  }
  const metadata = JSON.parse(retained.metadata)
  if (
    retained.contentHash !== evidence.contentHash ||
    row.byteSize !== evidence.byteSize ||
    row.mediaType !== evidence.mediaType ||
    row.presentationMode !== metadata.presentationMode ||
    JSON.stringify(ImageMetadataFullSchema.parse(metadata)) !==
      JSON.stringify(ImageMetadataFullSchema.parse(evidence.metadata))
  )
    return undefined
  return {
    imageRevisionId: retained.imageRevisionId,
    assetVersionId: row.assetVersionId,
  }
}
