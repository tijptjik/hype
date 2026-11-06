// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
// SERVICES
import { executeRevisionBatch } from './revisionBatch'
import { prepareRevisionChangeSet } from './revisionChangeSet'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
import type { RevisionCommand } from './revisionChangeSet'

/**
 * Registers finalized immutable image bytes and their first metadata revision.
 * @param db Request database.
 * @param input Authorized asset identity, verified object locator/hash and metadata.
 * @returns Stored image revision and asset version IDs, or null for changed authorization.
 * @remarks Storage finalization and content hashing must precede this command. Reusing
 * an object key is rejected; this does not authorize overwriting bytes in object storage.
 */
export async function createImageAssetRevision(
  db: Database,
  input: RevisionCommand & {
    imageId: string
    storageNamespace: string
    storageKey: string
    contentHash: string
    mediaType: string
    byteSize: number
    metadata: RevisionValue
    previousRevisionId?: string
  },
): Promise<{ assetVersionId: string; imageRevisionId: string } | null> {
  if (
    ![input.imageId, input.storageNamespace, input.storageKey, input.mediaType].every(
      value => value.trim(),
    ) ||
    !/^[a-f0-9]{64}$/i.test(input.contentHash) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0
  )
    throw new Error('Invalid finalized image asset')
  const change = prepareRevisionChangeSet(db, input),
    assetVersionId = crypto.randomUUID(),
    imageRevisionId = crypto.randomUUID()
  return (await executeRevisionBatch(db, input.guard, [
    change.statement,
    db.insert(imageAssetVersion).values({
      id: assetVersionId,
      imageId: input.imageId,
      storageNamespace: input.storageNamespace,
      storageKey: input.storageKey,
      contentHash: input.contentHash,
      mediaType: input.mediaType,
      byteSize: input.byteSize,
      changeSetId: change.id,
    }),
    db.insert(imageRevision).values({
      id: imageRevisionId,
      imageId: input.imageId,
      previousRevisionId: input.previousRevisionId,
      assetVersionId,
      changeSetId: change.id,
      metadata: input.metadata,
    }),
  ]))
    ? { assetVersionId, imageRevisionId }
    : null
}

/**
 * Appends image metadata without changing existing feature gallery pins or asset bytes.
 * @param db Request database.
 * @param input Authorized same-image predecessor, pinned asset and new metadata.
 * @returns New image revision ID, or null if the captured predecessor is absent.
 * @remarks Independent metadata proposals may branch. Adoption into each feature is
 * explicit and must pass through feature acceptance/publication.
 */
export async function createImageMetadataRevision(
  db: Database,
  input: RevisionCommand & {
    imageId: string
    previousRevisionId: string
    assetVersionId: string
    metadata: RevisionValue
  },
): Promise<string | null> {
  const change = prepareRevisionChangeSet(db, input),
    id = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM imageRevision WHERE id=${input.previousRevisionId} AND imageId=${input.imageId}) AND EXISTS (SELECT 1 FROM imageAssetVersion WHERE id=${input.assetVersionId} AND imageId=${input.imageId})`
  return (await executeRevisionBatch(db, guard, [
    change.statement,
    db.insert(imageRevision).values({
      id,
      imageId: input.imageId,
      previousRevisionId: input.previousRevisionId,
      assetVersionId: input.assetVersionId,
      changeSetId: change.id,
      metadata: input.metadata,
    }),
  ]))
    ? id
    : null
}
