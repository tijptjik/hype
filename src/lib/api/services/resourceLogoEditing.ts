// TABLE OF CONTENTS
// 1. Logo context and exact storage evidence
// 2. Baseline enrollment and shared-owner authorization

// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// DB
import { image } from '#lib/db/schema/index.js'
import { getImageById as loadImageById } from '#lib/db/services/image.js'
import {
  enrollResourceLogo,
  readResourceLogoHead,
} from '#lib/db/services/resourceLogoRevision.js'
import { registerImageRevisionBaseline } from '#lib/db/services/imageRevisionBaseline.js'
// AUTHORIZATION
import { assertPermissionsToUpdateImage } from './image.js'
// STORAGE
import { getStorageApiCredentials } from '#lib/images/storageCredentials.js'
import {
  toImageStage,
  getOriginalsBucketForStage,
  getOriginalsBucketNameForStage,
  readR2ObjectViaApi,
  readMetadataDocument,
} from '#lib/images/storage.js'
// ENUMS
import type { ImageContextResource } from '#lib/enums.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { GuardedQueryContext } from '#lib/api/guarded.types.js'
import type {
  LogoRevisionEvidence,
  ResourceLogoHead,
} from '#lib/db/services/resourceLogoRevision.js'
import type { ImageDBFlat } from '#lib/db/zod/schema/image.types.js'
import type { Id } from '#lib/types.js'

/** Identifies single-logo resources; avatars and Feature galleries have separate contracts.
 * @param value Context discriminator.
 * @returns Whether exact logo history applies.
 */
export function isLogoContext(
  value: string,
): value is
  | ImageContextResource.organisation
  | ImageContextResource.project
  | ImageContextResource.hub {
  return value === 'organisation' || value === 'project' || value === 'hub'
}

/** Reads and hashes the exact original; no source or metadata fallback is invented.
 * @param ctx Request environment.
 * @param locator Immutable object locator.
 * @param metadata Server-loaded metadata.
 * @returns Verified evidence and bytes for baseline registration.
 */
export async function readLogoEvidence(
  ctx: GuardedQueryContext,
  locator: { env: string; publicId: string },
  metadata: Record<string, unknown>,
): Promise<LogoRevisionEvidence & { bytes: ArrayBuffer }> {
  const stage = toImageStage(locator.env),
    bucket = getOriginalsBucketForStage(ctx.event.locals.platform, stage)
  const object = await bucket.get(locator.publicId)
  let bytes: ArrayBuffer | undefined,
    mediaType = object?.httpMetadata?.contentType
  if (object) bytes = await object.arrayBuffer()
  else {
    const credentials = getStorageApiCredentials(ctx.event.locals.platform)
    const remote = credentials
      ? await readR2ObjectViaApi({
          ...credentials,
          bucket: getOriginalsBucketNameForStage(stage),
          objectKey: locator.publicId,
          fetchFn: ctx.event.fetch,
        })
      : null
    if (remote) {
      bytes = Uint8Array.from(remote.body).buffer
      mediaType = remote.contentType ?? undefined
    }
  }
  if (!bytes?.byteLength || bytes.byteLength > 20 * 1024 * 1024)
    throw error(409, 'Exact logo bytes unavailable or too large')
  // Verify the original bytes before accepting metadata as immutable evidence.
  const contentHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0'),
  ).join('')
  if (
    typeof metadata.contentHash === 'string' &&
    metadata.contentHash.toLowerCase() !== contentHash
  )
    throw error(409, 'Logo content hash mismatch')
  return {
    bytes,
    asset: {
      storageNamespace: stage,
      storageKey: locator.publicId,
      contentHash,
      byteSize: bytes.byteLength,
      mediaType: mediaType?.split(';')[0] ?? '',
    },
    metadata: { ...metadata, contentHash } as LogoRevisionEvidence['metadata'],
  }
}

/** Freezes the current logo before replacement, removal or metadata editing.
 * @param ctx Authorized request.
 * @param imageId Current image.
 * @param guard Persisted authorized scope.
 * @returns Exact current head.
 * @remarks Old history remains unchanged; absent sidecars require explicit repair.
 */
export async function ensureLogoBaseline(
  ctx: GuardedQueryContext,
  imageId: string,
  guard: SQL,
): Promise<ResourceLogoHead> {
  const current = await readResourceLogoHead(ctx.db, imageId)
  if (current) return current
  const ownerGuard = await authorizeLogoOwners(ctx, imageId)
  guard = sql`(${guard}) AND (${ownerGuard})`
  const existing = await loadImageById(ctx.db, [eq(image.id, imageId as Id)])
  if (!existing) throw error(409, 'Logo changed')
  const stage = toImageStage(existing.env)
  const { document } = await readMetadataDocument({
    platform: ctx.event.locals.platform,
    env: stage,
    publicId: existing.publicId,
    version: existing.version ?? undefined,
    exact: true,
    fetchFn: ctx.event.fetch,
  })
  if (!document)
    throw error(
      409,
      'Exact logo metadata is missing; repair the baseline before editing',
    )
  const evidence = await readLogoEvidence(
    ctx,
    { env: stage, publicId: existing.publicId },
    document as Record<string, unknown>,
  )
  // Pin the original and enroll the logo under the same persisted owner fence.
  const pin = await registerImageRevisionBaseline(ctx.db, {
    imageId,
    actorId: ctx.userId,
    origin: 'migration',
    guard,
    expectedModifiedAt: existing.modifiedAt,
    expectedVersion: existing.version,
    storageNamespace: stage,
    storageKey: existing.publicId,
    bytes: evidence.bytes,
    mediaType: evidence.asset.mediaType,
    metadata: document,
    captureCurrentPresentation: true,
  })
  if (
    !pin ||
    !(await enrollResourceLogo(ctx.db, {
      imageId,
      imageRevisionId: pin.imageRevisionId,
      guard,
      actorId: ctx.userId,
    }))
  )
    throw error(409, 'Logo changed during baseline capture')
  return (await readResourceLogoHead(ctx.db, imageId))!
}

/** Authorizes all current owners before changing a shared logo identity.
 * @param ctx Authenticated editor.
 * @param imageId Shared image identity.
 * @returns Exact owner-set fence, preventing a concurrent new association from extending authority.
 */
export async function authorizeLogoOwners(
  ctx: GuardedQueryContext,
  imageId: string,
): Promise<SQL> {
  // Fence the complete owner set so a concurrent association cannot extend authority.
  const owners = sql`SELECT 'organisation' kind,id FROM organisation WHERE imageId=${imageId}
    UNION ALL SELECT 'project',id FROM project WHERE imageId=${imageId}
    UNION ALL SELECT 'hub',id FROM hub WHERE imageId=${imageId}`
  const rows = await ctx.db.all<{
    kind: 'organisation' | 'project' | 'hub'
    id: string
  }>(sql`SELECT * FROM (${owners}) ORDER BY kind,id`)
  for (const row of rows)
    await assertPermissionsToUpdateImage(
      ctx.db,
      ctx.user,
      ctx.isAdminRequest,
      { id: imageId } as ImageDBFlat,
      ctx.userRoles,
      imageId,
      row.id,
      row.kind as ImageContextResource,
    )
  const encoded = JSON.stringify(rows)
  return sql`(SELECT json_group_array(json_object('kind',kind,'id',id)) FROM (SELECT * FROM (${owners}) ORDER BY kind,id))=${encoded}`
}
