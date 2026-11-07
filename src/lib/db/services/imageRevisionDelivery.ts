// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { hasResourceLogoStorage } from './resourceLogoSnapshot'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

export type PinnedImageDelivery = {
  imageId: string
  revisionId: string
  storageNamespace: string
  storageKey: string
  contentHash: string
  mediaType: string
  byteSize: number
  metadata: RevisionValue
}

/**
 * Resolves an exact image revision under current public visibility or a scoped preview grant.
 * @param db Request database.
 * @param revisionId Exact immutable image revision, never a newest-version lookup.
 * @param previewGuard Optional server-authorized predicate correlated to image alias i.
 * @returns Pinned bytes and metadata, or null for unavailable/private/moderated content.
 * @remarks Public access requires the image to be in a currently accepted gallery and
 * its live public assignment. Historical/proposal-only references do not grant access.
 * Moderation overrides both public and preview grants. Callers must not cache past revocation.
 */
export async function readImageRevisionDelivery(
  db: Database,
  revisionId: string,
  previewGuard: SQL = sql`0`,
): Promise<PinnedImageDelivery | null> {
  const logoPublic = await hasResourceLogoStorage(db) ? sql`EXISTS (
    SELECT 1 FROM resourceLogoImageHead logo WHERE logo.imageId=i.id AND logo.imageRevisionId=ir.id AND (
      EXISTS(SELECT 1 FROM organisation o WHERE o.imageId=i.id AND o.isPublished=1 AND o.isArchived=0)
      OR EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.imageId=i.id AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0)
      OR EXISTS(SELECT 1 FROM hub h WHERE h.imageId=i.id AND h.isPublished=1 AND h.isArchived=0)))` : sql`0`
  const accepted=await hasFeatureLifecycleStorage(db)?sql`featureRevisionImage pin
      JOIN feature f ON f.currentRevisionId=pin.featureRevisionId
      JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id`:
    sql`featureRevisionImage pin JOIN featureRevisionHead h ON h.publishedRevisionId=pin.featureRevisionId AND h.state='active'
      JOIN featureRevision r ON r.id=h.publishedRevisionId AND r.featureId=h.featureId JOIN feature f ON f.id=h.featureId`
  const row = await db.get<
    Omit<PinnedImageDelivery, 'metadata'> & { metadata: string }
  >(sql`
    SELECT i.id AS imageId,ir.id AS revisionId,av.storageNamespace,av.storageKey,
      av.contentHash,av.mediaType,av.byteSize,ir.metadata
    FROM imageRevision ir JOIN image i ON i.id=ir.imageId
    JOIN imageAssetVersion av ON av.id=ir.assetVersionId AND av.imageId=i.id
    WHERE ir.id=${revisionId} AND i.isArchived=0 AND ((${previewGuard}) OR (${logoPublic}) OR EXISTS (
      SELECT 1 FROM ${accepted}
      JOIN layer l ON l.id=f.layerId AND l.projectId=f.projectId
      JOIN project p ON p.id=f.projectId AND p.organisationId=f.organisationId
      JOIN organisation o ON o.id=f.organisationId
      JOIN featureImage fi ON fi.featureId=f.id AND fi.imageId=i.id
      WHERE pin.imageId=i.id AND pin.imageRevisionId=ir.id AND pin.intent!='research'
        AND EXISTS (SELECT 1 FROM json_each(r.content,'$.gallery.entries') entry
          WHERE entry.key=i.id AND json_extract(entry.value,'$.imageRevisionId')=ir.id
            AND json_extract(entry.value,'$.isPublished')=1)
        AND fi.isPublished=1 AND fi.intent!='research'
        AND f.isPublished=1 AND f.isArchived=0 AND f.isDraft=0
        AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0
        AND o.isPublished=1 AND o.isArchived=0
    ))`)
  return row ? { ...row, metadata: JSON.parse(row.metadata) as RevisionValue } : null
}

/**
 * Verifies the exact object returned by storage before serving a retained revision.
 * @param pin Stored digest and size verified when the immutable object was registered.
 * @param bytes Object bytes from the pinned namespace/key, with no fallback.
 * @returns Whether the object still matches its immutable identity.
 */
export async function verifyImageRevisionBytes(
  pin: Pick<PinnedImageDelivery, 'contentHash' | 'byteSize'>,
  bytes: ArrayBuffer,
): Promise<boolean> {
  if (bytes.byteLength !== pin.byteSize) return false
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return hash === pin.contentHash.toLowerCase()
}
