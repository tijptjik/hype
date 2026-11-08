// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, exists, sql } from 'drizzle-orm'
// DB
import { image } from '#lib/db/schema/image.js'
import { user } from '#lib/db/schema/user.js'
import { imageUpload } from '#lib/db/schema/imageUpload.js'
import { getUploadedImageId } from './image.js'
import { prepareRevisionCheck } from './revisionBatch.js'
// DELIVERY
import { resolveImageAssetBaseUrl } from '#lib/images/assetUrl.js'
import { toCloudflareImageWorkerPath } from '#lib/images/delivery.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { ImageDBNew } from '#lib/db/zod/schema/image.types.js'

// TABLE OF CONTENTS
// 1. Verified staging and replay
// 2. Atomic attachment plans
export type SingleImageContext = typeof imageUpload.$inferSelect.ctxType
export type StagedImageUpload = typeof imageUpload.$inferSelect

/** Identify destinations with one selected image.
 * @param value Upload destination.
 * @returns Whether the shared single-image lifecycle applies.
 */
export function isSingleImageContext(value: string): value is SingleImageContext {
  return ['user', 'project', 'organisation', 'hub'].includes(value)
}

/** Persist verified bytes independently of attachment, preserving the first confirmation.
 * @param db Request database.
 * @param params Server-verified asset, destination, uploader and resource snapshot.
 * @returns Stable receipt, including on retry.
 * @remarks No image row is visible to resource queries until attachment commits.
 */
export async function stageImageUpload(
  db: Database,
  params: {
    data: ImageDBNew
    actorId: string
    ctxType: SingleImageContext
    ctxId: string
    snapshot: StagedImageUpload['snapshot']
    evidence?: StagedImageUpload['evidence']
    expiresAt: number
  },
): Promise<StagedImageUpload> {
  const id = await getUploadedImageId(params.data)
  const now = new Date().toISOString()
  await db
    .insert(imageUpload)
    .values({
      imageId: id,
      actorId: params.actorId,
      ctxType: params.ctxType,
      ctxId: params.ctxId,
      state: 'pending',
      expiresAt: params.expiresAt,
      snapshot: params.snapshot,
      evidence: params.evidence
        ? { asset: params.evidence.asset, metadata: params.evidence.metadata }
        : null,
      data: {
        cdnId: null,
        contentHash: null,
        version: null,
        isArchived: false,
        localIsArchived: null,
        createdAt: now,
        modifiedAt: now,
        ...params.data,
        contributorId: params.actorId,
        id,
      },
    })
    .onConflictDoNothing({ target: imageUpload.imageId })
  return loadStagedImageUpload(db, id, params.actorId, params.ctxType, params.ctxId)
}

/** Resolve a receipt under its original actor and destination.
 * @param db Request database.
 * @param id Server-derived image identity.
 * @param actorId Current uploader.
 * @param ctxType Requested destination type.
 * @param ctxId Requested destination identity.
 * @returns Pending or attached receipt; canceled and expired receipts cannot be reused.
 */
export async function loadStagedImageUpload(
  db: Database,
  id: string,
  actorId: string,
  ctxType: SingleImageContext,
  ctxId: string,
): Promise<StagedImageUpload> {
  const [row] = await db
    .select()
    .from(imageUpload)
    .where(
      and(
        eq(imageUpload.imageId, id),
        eq(imageUpload.actorId, actorId),
        eq(imageUpload.ctxType, ctxType),
        eq(imageUpload.ctxId, ctxId),
      ),
    )
    .limit(1)
  if (
    !row ||
    row.state === 'discarded' ||
    (row.state === 'pending' && row.expiresAt <= Date.now())
  )
    error(409, 'Upload expired or is no longer available. Upload the image again.')
  return row
}

/** Build the live receipt predicate used inside the resource transaction.
 * @param db Request database.
 * @param receipt Previously authorized receipt.
 * @returns Predicate that excludes cancellation and expiry, while allowing attached retries.
 */
export function imageUploadGuard(db: Database, receipt: StagedImageUpload): SQL {
  return exists(
    db
      .select({ id: imageUpload.imageId })
      .from(imageUpload)
      .where(
        and(
          eq(imageUpload.imageId, receipt.imageId),
          eq(imageUpload.actorId, receipt.actorId),
          sql`(${imageUpload.state} = 'attached' OR (${imageUpload.state} = 'pending' AND ${imageUpload.expiresAt} > ${Date.now()}))`,
        ),
      ),
  )
}

/** Record attachment in the same batch that selects the resource image.
 * @param db Request database.
 * @param receipt Authorized receipt.
 * @param selectedUrl Optional persisted avatar URL, resolved server-side.
 * @returns Unexecuted receipt transition.
 */
export function markImageUploadAttached(
  db: Database,
  receipt: StagedImageUpload,
  selectedUrl?: string,
): BatchItem<'sqlite'> {
  return db
    .update(imageUpload)
    .set({ state: 'attached', ...(selectedUrl ? { selectedUrl } : {}) })
    .where(eq(imageUpload.imageId, receipt.imageId))
}

/** Prepare avatar attachment for composition with profile Save or immediate upload.
 * @param db Request database.
 * @param receipt Actor-bound verified upload.
 * @param appOrigin Request origin used by the shared delivery resolver.
 * @returns URL, live selection guard and writes to execute atomically with the profile update.
 */
export function prepareUserImageAttachment(
  db: Database,
  receipt: StagedImageUpload,
  appOrigin: string,
): {
  url: string
  guard: SQL
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
} {
  if (receipt.ctxType !== 'user') error(400, 'Invalid avatar destination')
  const url = `${resolveImageAssetBaseUrl(receipt.data.env === 'production' ? 'production' : receipt.data.env === 'preview' ? 'preview' : 'local', appOrigin)}${toCloudflareImageWorkerPath(
    {
      publicId: receipt.data.publicId,
      version: receipt.data.version,
      transformation: 'c_fill,h_512,w_512',
    },
  )}`
  const current = db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, receipt.ctxId),
        receipt.state === 'attached'
          ? eq(user.image, receipt.selectedUrl ?? url)
          : and(
              sql`${user.image} IS ${receipt.snapshot.imageId}`,
              sql`CAST(${user.updatedAt} AS TEXT) = ${receipt.snapshot.modifiedAt}`,
            ),
      ),
    )
  const guard = and(imageUploadGuard(db, receipt), exists(current))!
  return {
    url,
    guard,
    before: [
      db.insert(image).values(receipt.data).onConflictDoNothing({ target: image.id }),
    ],
    after: [
      prepareRevisionCheck(
        db,
        exists(
          db
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.id, receipt.ctxId), eq(user.image, url))),
        ),
      ),
      markImageUploadAttached(db, receipt, url),
      // Retire replaced avatars only after the new profile pointer has committed in this batch.
      db
        .update(imageUpload)
        .set({ state: 'discarded' })
        .where(
          and(
            eq(imageUpload.ctxType, 'user'),
            eq(imageUpload.ctxId, receipt.ctxId),
            eq(imageUpload.state, 'attached'),
            sql`${imageUpload.imageId} != ${receipt.imageId}`,
            sql`NOT EXISTS (SELECT 1 FROM user owner WHERE owner.image = ${imageUpload.selectedUrl})`,
          ),
        ),
    ],
  }
}

/** Capture the avatar selection before authorizing an upload.
 * @param db Request database.
 * @param id Destination user.
 * @returns Signed baseline or null if the profile is missing.
 */
export async function getUserImageUploadSnapshot(
  db: Database,
  id: string,
): Promise<StagedImageUpload['snapshot'] | null> {
  return (
    (
      await db
        .select({
          imageId: user.image,
          modifiedAt: sql<string>`CAST(${user.updatedAt} AS TEXT)`,
          organisationId: sql<null>`NULL`,
          hubId: sql<null>`NULL`,
        })
        .from(user)
        .where(eq(user.id, id))
        .limit(1)
    )[0] ?? null
  )
}

/** Claim a pending receipt for cleanup before any object deletion occurs.
 * @param db Request database.
 * @param imageId Uploaded asset identity.
 * @param actorId Original uploader.
 * @returns Canceled receipt, or null if attachment won the race.
 */
export async function discardStagedImageUpload(
  db: Database,
  imageId: string,
  actorId: string,
): Promise<StagedImageUpload | null> {
  return (
    (
      await db
        .update(imageUpload)
        .set({ state: 'discarded' })
        .where(
          and(
            eq(imageUpload.imageId, imageId),
            eq(imageUpload.actorId, actorId),
            sql`${imageUpload.state} IN ('pending', 'discarded')`,
          ),
        )
        .returning()
    )[0] ?? null
  )
}

/** Find bounded cleanup work without exposing receipt identities to clients.
 * @param db Request database.
 * @param actorId Actor whose expired pending uploads may be reclaimed.
 * @returns At most ten terminal receipts or expired uploads owned by this actor.
 */
export async function listImageUploadsForCleanup(
  db: Database,
  actorId: string,
): Promise<StagedImageUpload[]> {
  return db
    .select()
    .from(imageUpload)
    .where(
      and(
        sql`${imageUpload.expiresAt} > 0`,
        sql`(${imageUpload.state} = 'discarded' OR (${imageUpload.actorId} = ${actorId} AND ${imageUpload.state} = 'pending' AND ${imageUpload.expiresAt} <= ${Date.now()}))`,
      ),
    )
    .limit(10)
}
