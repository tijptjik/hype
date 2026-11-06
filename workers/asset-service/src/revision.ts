// DOMAIN
import { parseRevisionTransformOptions } from '../../../src/lib/images/revisionTransformOptions'
// TYPES
import type { RevisionTransformOptions } from '../../../src/lib/images/revisionTransformOptions'

const MAX_REVISION_BYTES = 20 * 1024 * 1024
export type RevisionPixelTransform = (
  bytes: ArrayBuffer,
  mediaType: string,
  options: RevisionTransformOptions & { renderRotation: 0 | 90 | 180 | 270 },
) => Promise<{ body: ArrayBuffer | ReadableStream<Uint8Array>; contentType: string }>

/**
 * Handles service-only revision transformations without storage, URL fetches or derivative caches.
 * @param request Verified bytes and immutable rotation forwarded by the authorized app.
 * @param transform The asset Worker's existing decode/rotate/crop/resize/encode pipeline.
 * @param acquire Shared Worker transform-capacity guard.
 * @returns A private transformed response or a bounded validation/capacity failure.
 */
export async function handleRevisionTransform(
  request: Request,
  transform: RevisionPixelTransform,
  acquire: () => (() => void) | null,
): Promise<Response> {
  const headers = {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  }
  if (request.method !== 'POST')
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...headers, allow: 'POST' },
    })
  const rotation = Number(request.headers.get('x-revision-render-rotation') ?? -1)
  const mediaType = request.headers.get('content-type') ?? ''
  if (![0, 90, 180, 270].includes(rotation))
    return new Response('Invalid retained rotation', { status: 400, headers })
  if (!/^image\/(jpeg|png|webp|avif)$/.test(mediaType))
    return new Response('Unsupported source media type', { status: 415, headers })
  let options: RevisionTransformOptions
  try {
    options = parseRevisionTransformOptions(new URL(request.url))
  } catch {
    return new Response('Invalid image transformation', { status: 400, headers })
  }
  const release = acquire()
  if (!release)
    return new Response('Transformer busy', {
      status: 503,
      headers: { ...headers, 'retry-after': '2' },
    })
  try {
    // Enforce the byte bound while reading; Content-Length alone is not trusted.
    const reader = request.body?.getReader()
    if (!reader) return new Response('Image bytes required', { status: 400, headers })
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > MAX_REVISION_BYTES) {
        await reader.cancel()
        return new Response('Image too large', { status: 413, headers })
      }
      chunks.push(chunk.value)
    }
    if (!length) return new Response('Image bytes required', { status: 400, headers })
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    chunks.length = 0
    const result = await transform(bytes.buffer, mediaType, {
      ...options,
      renderRotation: rotation as 0 | 90 | 180 | 270,
    })
    return new Response(result.body, {
      headers: {
        ...headers,
        'content-type': result.contentType,
        'x-image-transform-provider': 'local',
      },
    })
  } catch {
    return new Response('Unable to transform retained image', { status: 415, headers })
  } finally {
    release()
  }
}
