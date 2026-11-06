// SVELTE
import { error } from '@sveltejs/kit'
// API
import { readResourceLogoPreview } from '#lib/api/services/resourceLogoPreview.js'
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// AUTHORIZATION
import { readFeatureImageRevisionPreview } from '#lib/api/services/imageRevisionPreview.js'
import { getUserRoles } from '#lib/db/services/user.js'
// SERVICES
import {
  verifyImageRevisionBytes,
} from '#lib/db/services/imageRevisionDelivery.js'
import {
  getOriginalsBucketForStage,
  toMetadataProfilePayload,
} from '#lib/images/storage.js'
// VALIDATION
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
import { transformImageRevision } from '#lib/images/revisionTransform.js'
// TYPES
import type { RequestHandler } from './$types'
import type { Database, Id } from '#lib/types.js'

/**
 * Checks public delivery or an independently authorized current Feature gallery preview.
 * @param db Request database.
 * @param locals Current authenticated request, when present.
 * @param revisionId Exact requested image revision.
 * @param featureId Optional preview context; never an authorization grant itself.
 * @returns Visible pin, or null without disclosing private metadata or storage keys.
 */
async function visiblePin(db: Database, locals: App.Locals, revisionId: string, featureId: string | null) {
  const actor = locals.user && locals.session ? { user: locals.user,
    userRoles: locals.user.isAnonymous ? [] : await getUserRoles(db, locals.user.id as Id) } : undefined
  return await readFeatureImageRevisionPreview(db, revisionId, featureId, actor) ?? await readResourceLogoPreview(db, revisionId, actor)
}

/**
 * Delivers exact published image bytes or their public metadata after live visibility checks.
 * @param event Request containing the immutable image revision ID.
 * @returns Verified original bytes or the public metadata profile; never a latest fallback.
 * @remarks Private/no-store responses preserve moderation revocation. Transforms use
 * verified bytes and retained metadata; public metadata never includes full EXIF.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const pin = await visiblePin(db, locals, params.revision, url.searchParams.get('feature'))
  if (!pin) throw error(404, 'Image revision not available')
  const headers = {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  }
  if (url.searchParams.get('metadata') === '1') {
    const metadata = ImageMetadataFullSchema.safeParse(pin.metadata)
    if (!metadata.success) throw error(409, 'Image metadata requires migration')
    return Response.json(toMetadataProfilePayload(metadata.data, 'basic'), { headers })
  }
  if (
    pin.storageNamespace !== 'local' &&
    pin.storageNamespace !== 'preview' &&
    pin.storageNamespace !== 'production'
  )
    throw error(409, 'Image storage requires migration')
  const bucket = getOriginalsBucketForStage(locals.platform, pin.storageNamespace)
  const object = await bucket.get(pin.storageKey)
  if (!object) throw error(404, 'Image revision object not available')
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(pin.mediaType))
    throw error(415, 'Unsupported image revision media type')
  if (object.size !== pin.byteSize)
    throw error(409, 'Image revision integrity mismatch')
  if (pin.byteSize > 20 * 1024 * 1024)
    throw error(413, 'Image revision exceeds the supported delivery size')
  const bytes = await object.arrayBuffer()
  if (!(await verifyImageRevisionBytes(pin, bytes)))
    throw error(409, 'Image revision integrity mismatch')
  // Recheck moderation/publication after storage I/O, including requests racing a takedown.
  const transformed = await transformImageRevision(locals.platform?.env?.ASSET_TRANSFORMER, bytes, pin.mediaType, pin.metadata, url)
  if (!(await visiblePin(db, locals, params.revision, url.searchParams.get('feature'))))
    throw error(404, 'Image revision not available')
  if (transformed) return new Response(transformed.body, {
    headers: { ...headers, 'content-type': transformed.headers.get('content-type') ?? 'image/webp' },
  })
  return new Response(bytes, {
    headers: {
      ...headers,
      'content-type': pin.mediaType,
      'content-length': String(pin.byteSize),
    },
  })
}
