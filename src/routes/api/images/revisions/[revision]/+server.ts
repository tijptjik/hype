// SVELTE
import { error } from '@sveltejs/kit'
// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// SERVICES
import {
  verifyImageRevisionBytes,
  readImageRevisionAddress,
} from '#lib/db/services/imageRevisionDelivery.js'
import {
  getOriginalsBucketForStage,
  getDerivedBucketForStage,
  toMetadataProfilePayload,
} from '#lib/images/storage.js'
// VALIDATION
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
import { revisionDerivativeKey } from '#lib/images/revisionDerivative.js'
import { transformImageRevision } from '#lib/images/revisionTransform.js'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Delivers an exact image by its opaque address, independently of the viewer's session.
 * @param event Request containing the immutable image revision ID.
 * @returns Publicly cacheable exact-version derivatives, originals or basic metadata.
 * @remarks Task/feature APIs control discovery. Known image addresses grant delivery;
 * cached derivatives bypass original processing, and source misses never use latest bytes.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const pin = await readImageRevisionAddress(db, params.revision)
  if (!pin) throw error(404, 'Image revision not available')
  const headers = {
    'cache-control': 'public, max-age=31536000, immutable',
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
  // Use the same versioned derivatives as the asset Worker before touching original bytes.
  let derivativeKey: string | null
  try {
    derivativeKey = revisionDerivativeKey(pin, url)
  } catch (cause) {
    throw error(
      400,
      cause instanceof Error ? cause.message : 'Invalid image transformation',
    )
  }
  if (derivativeKey) {
    const cached = await getDerivedBucketForStage(
      locals.platform,
      pin.storageNamespace,
    ).get(derivativeKey)
    if (cached)
      return new Response(cached.body as unknown as ReadableStream<Uint8Array>, {
        headers: {
          ...headers,
          'content-type': cached.httpMetadata?.contentType ?? 'image/webp',
          'content-length': String(cached.size),
          'x-image-cache': 'r2-derived-hit',
        },
      })
  }
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
  // Render only cache misses from the retained source and immutable metadata.
  const transformed = await transformImageRevision(
    locals.platform?.env?.ASSET_TRANSFORMER,
    bytes,
    pin.mediaType,
    pin.metadata,
    url,
  )
  if (transformed)
    return new Response(transformed.body, {
      headers: {
        ...headers,
        'content-type': transformed.headers.get('content-type') ?? 'image/webp',
      },
    })
  return new Response(bytes, {
    headers: {
      ...headers,
      'content-type': pin.mediaType,
      'content-length': String(pin.byteSize),
    },
  })
}
