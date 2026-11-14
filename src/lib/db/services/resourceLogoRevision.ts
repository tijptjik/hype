// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
import { resourceLogoImageHead } from '../schema/resourceLogoRevision'
import { image } from '../schema/image'
// SERVICES
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { prepareRevisionCheck, executeRevisionBatch } from './revisionBatch'
import { prepareOrganisationRevisionCapture } from './organisationRevision'
import {
  prepareAdminResourceRevisionCapture,
  isAdminResourceRevisionRecordingEnabled,
} from './adminResourceRevision'
import { hasResourceLogoStorage } from './resourceLogoSnapshot'
import { retryBusyRead } from './sqlite'
import { equalRevisionValue } from '#lib/revisions/merge.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'
import type {
  OrganisationRevisionCapture,
  OrganisationRevisionActor,
} from './organisationRevision'
import type { RevisionValue } from '#lib/revisions/merge.js'

// TABLE OF CONTENTS
// 1. Exact logo selection and shared-owner capture
// 2. Prepared immutable image changes

export type LogoAssetEvidence = {
  storageNamespace: string
  storageKey: string
  contentHash: string
  byteSize: number
  mediaType: string
}
export type LogoRevisionEvidence = { metadata: RevisionValue; asset: LogoAssetEvidence }
export type ResourceLogoHead = LogoRevisionEvidence & {
  imageRevisionId: string
  assetVersionId: string
}

/** Restores the display projection when an already-selected logo mode is saved again.
 * @param db Request database.
 * @param input Authorized image identity, selected revision and owner/context fence.
 * @returns Whether the selected revision and authorization still match.
 * @remarks Repairs only the projection; immutable history and timestamps remain unchanged.
 */
export async function reconcileLogoPresentation(
  db: Database,
  input: { imageId: string; imageRevisionId: string; guard: SQL; actorId: string },
): Promise<boolean> {
  // Read the mode from the fenced revision inside the transaction, never from client input.
  const selected = sql`SELECT json_extract(r.metadata,'$.presentationMode') FROM resourceLogoImageHead h
    JOIN imageRevision r ON r.id=h.imageRevisionId AND r.imageId=h.imageId
    WHERE h.imageId=${input.imageId} AND h.imageRevisionId=${input.imageRevisionId}`
  const capture = await captureLogoOwners(
    db,
    input.imageId,
    {
      actorId: input.actorId,
      reason: 'Logo display projection reconciled',
    },
    false,
  )
  const result = await executeRevisionBatch(
    db,
    sql`(${input.guard}) AND (${selected}) IN ('cover','contain','cast-edges')`,
    [
      ...capture.before,
      db
        .update(image)
        .set({
          presentationMode: sql`(${selected})`,
          modifiedAt: sql`${image.modifiedAt}`,
        })
        .where(
          sql`${image.id}=${input.imageId} AND ${image.presentationMode} IS NOT (${selected})`,
        ),
      ...capture.after,
    ],
  )
  return result !== null
}

/** Reads the current exact logo version without changing any resource.
 * @param db Request database.
 * @param imageId Image identity.
 * @returns Verified pin, or null before enrollment.
 */
export async function readResourceLogoHead(
  db: Database,
  imageId: string,
): Promise<ResourceLogoHead | null> {
  if (!(await hasResourceLogoStorage(db))) return null
  // Retry only the read; baseline enrollment and rotation writes must not be replayed.
  const row = await retryBusyRead(() =>
    db.get<
      LogoAssetEvidence & {
        imageRevisionId: string
        assetVersionId: string
        metadata: string
      }
    >(sql`
    SELECT h.imageRevisionId,r.assetVersionId,r.metadata,a.storageNamespace,a.storageKey,a.contentHash,a.byteSize,a.mediaType
    FROM resourceLogoImageHead h JOIN imageRevision r ON r.id=h.imageRevisionId AND r.imageId=h.imageId
    JOIN imageAssetVersion a ON a.id=r.assetVersionId AND a.imageId=r.imageId WHERE h.imageId=${imageId}`),
  )
  if (!row) return null
  const { imageRevisionId, assetVersionId, metadata, ...asset } = row
  return {
    imageRevisionId,
    assetVersionId,
    metadata: JSON.parse(metadata) as RevisionValue,
    asset,
  }
}

/** Captures every current logo owner before a shared image changes.
 * @param db Request database.
 * @param imageId Shared image identity.
 * @param actor Authorized operation actor.
 * @param touchModifiedAt Whether the edit also advances owner concurrency tokens.
 * @returns Ordered enclosing resource captures.
 * @remarks Caller must authorize every affected owner before mutation.
 */
async function captureLogoOwners(
  db: Database,
  imageId: string,
  actor: OrganisationRevisionActor,
  touchModifiedAt = true,
): Promise<OrganisationRevisionCapture> {
  // A logo must not acquire an exact head while any current owner cannot record its snapshot.
  for (const resource of ['project', 'hub'] as const) {
    const owner = await db.get(
      sql`SELECT 1 FROM ${sql.identifier(resource)} WHERE imageId=${imageId} LIMIT 1`,
    )
    if (owner && !(await isAdminResourceRevisionRecordingEnabled(db, resource))) {
      throw new Error(
        `Logo history requires ${resource} revision recording to be enabled`,
      )
    }
  }
  const captures = [
    await prepareOrganisationRevisionCapture(
      db,
      sql`SELECT id FROM organisation WHERE imageId=${imageId}`,
      actor,
      { touchModifiedAt },
    ),
    await prepareAdminResourceRevisionCapture(
      db,
      'project',
      sql`SELECT id FROM project WHERE imageId=${imageId}`,
      actor,
      { touchModifiedAt },
    ),
    await prepareAdminResourceRevisionCapture(
      db,
      'hub',
      sql`SELECT id FROM hub WHERE imageId=${imageId}`,
      actor,
      { touchModifiedAt },
    ),
  ]
  return {
    before: captures.flatMap(c => c.before),
    after: captures.flatMap(c => c.after),
  }
}

/** Pins verified legacy media as a new, attributed resource snapshot without rewriting old history.
 * @param db Request database.
 * @param input Exact registered image revision and source/authorization guard.
 * @returns Whether pinning committed.
 * @remarks This does not infer versions for prior snapshots.
 */
export async function enrollResourceLogo(
  db: Database,
  input: { imageId: string; imageRevisionId: string; guard: SQL; actorId: string },
): Promise<boolean> {
  if (!(await hasResourceLogoStorage(db))) return false
  const current = await readResourceLogoHead(db, input.imageId)
  if (current) return current.imageRevisionId === input.imageRevisionId
  const capture = await captureLogoOwners(
    db,
    input.imageId,
    {
      actorId: input.actorId,
      origin: 'system',
      reason: 'Verified baseline',
    },
    false,
  )
  return Boolean(
    await executeRevisionBatch(
      db,
      sql`(${input.guard}) AND NOT EXISTS(SELECT 1 FROM resourceLogoImageHead WHERE imageId=${input.imageId})`,
      [
        ...capture.before,
        db
          .insert(resourceLogoImageHead)
          .values({ imageId: input.imageId, imageRevisionId: input.imageRevisionId }),
        ...capture.after,
      ],
    ),
  )
}

/** Prepares atomic immutable metadata/file recording around the existing image writer.
 * @param db Request database.
 * @param input Verified bytes/metadata and authenticated actor.
 * @returns Statements enclosing the identity mutation, or empty statements for an exact upload replay.
 * @remarks Storage IO precedes this function. No remote writes occur here. The caller executes both halves
 * in its existing guarded transaction. Image keys cannot be reused for different bytes.
 */
export async function prepareResourceLogoRevision(
  db: Database,
  input: LogoRevisionEvidence & {
    imageId: string
    actorId: string
    reason: string
    initialUpload?: boolean
    replaySameAsset?: boolean
    expectedRevisionId?: string
    guard?: SQL
  },
): Promise<OrganisationRevisionCapture> {
  if (!(await hasResourceLogoStorage(db))) return { before: [], after: [] }
  const head = await readResourceLogoHead(db, input.imageId)
  if (!input.initialUpload && !head)
    throw new Error('Logo requires an exact baseline before editing')
  if (
    !input.metadata ||
    typeof input.metadata !== 'object' ||
    Array.isArray(input.metadata) ||
    !Number.isSafeInteger(input.metadata.version) ||
    Number(input.metadata.version) < 1 ||
    !IMAGE_PRESENTATION_MODES.some(
      mode => mode === (input.metadata as Record<string, unknown>).presentationMode,
    )
  )
    throw new Error('Invalid exact logo metadata')
  const a = input.asset
  if (
    !/^[a-f0-9]{64}$/.test(a.contentHash) ||
    a.byteSize <= 0 ||
    !/^image\/(jpeg|png|webp|avif|gif)$/.test(a.mediaType)
  )
    throw new Error('Invalid verified logo asset')
  if (
    head &&
    equalRevisionValue(
      head.asset as unknown as RevisionValue,
      a as unknown as RevisionValue,
    ) &&
    (input.initialUpload || input.replaySameAsset)
  )
    return { before: [], after: [] }
  if (input.expectedRevisionId && head?.imageRevisionId !== input.expectedRevisionId)
    throw new Error('STALE_LOGO_REVISION')
  if (
    head &&
    equalRevisionValue(
      head.asset as unknown as RevisionValue,
      a as unknown as RevisionValue,
    ) &&
    equalRevisionValue(head.metadata, input.metadata)
  )
    return { before: [], after: [] }
  const existing = await db.get<{
    id: string
    imageId: string
    contentHash: string
    byteSize: number
    mediaType: string
  }>(sql`
    SELECT id,imageId,contentHash,byteSize,mediaType FROM imageAssetVersion WHERE storageNamespace=${a.storageNamespace} AND storageKey=${a.storageKey}`)
  if (
    existing &&
    (existing.imageId !== input.imageId ||
      existing.contentHash !== a.contentHash ||
      existing.byteSize !== a.byteSize ||
      existing.mediaType !== a.mediaType)
  )
    throw new Error('Logo object key already contains different immutable evidence')
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    origin: 'user',
    reason: input.reason,
  })
  const assetVersionId = existing?.id ?? crypto.randomUUID(),
    imageRevisionId = crypto.randomUUID()
  const capture = await captureLogoOwners(db, input.imageId, {
    actorId: input.actorId,
    reason: input.reason,
  })
  // Fence the selected image revision and all resource heads before the enclosing writer mutates anything.
  return {
    before: [
      prepareRevisionCheck(
        db,
        sql`(${input.guard ?? sql`1`}) AND (SELECT imageRevisionId FROM resourceLogoImageHead WHERE imageId=${input.imageId}) IS ${head?.imageRevisionId ?? null}`,
      ),
      ...capture.before,
    ],
    after: [
      change.statement,
      ...(!existing
        ? [
            db.insert(imageAssetVersion).values({
              id: assetVersionId,
              imageId: input.imageId,
              changeSetId: change.id,
              ...a,
            }),
          ]
        : []),
      db.insert(imageRevision).values({
        id: imageRevisionId,
        imageId: input.imageId,
        assetVersionId,
        previousRevisionId: head?.imageRevisionId ?? null,
        changeSetId: change.id,
        metadata: input.metadata,
      }),
      db
        .insert(resourceLogoImageHead)
        .values({ imageId: input.imageId, imageRevisionId })
        .onConflictDoUpdate({
          target: resourceLogoImageHead.imageId,
          set: { imageRevisionId },
        }),
      ...capture.after,
    ],
  }
}
