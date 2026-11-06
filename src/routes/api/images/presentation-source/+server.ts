// SVELTE
import { error } from '@sveltejs/kit'
import { PUBLIC_ASSET_BASE_URL, PUBLIC_PREVIEW_ASSET_BASE_URL } from '$app/env/public'
// IMAGE PRESENTATION
import { resolvePresentationSource } from '#lib/images/presentationSource.js'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Makes already-public image bytes readable for non-destructive browser rim analysis.
 * @param event - Request naming an allowlisted public image delivery URL.
 * @returns A bounded image stream, with no credentials forwarded upstream.
 * @remarks This does not read originals buckets or private revision previews. Redirects,
 * arbitrary hosts, non-image bodies and oversized streams are refused.
 */
export const GET: RequestHandler = async ({ url }) => {
  const source = resolvePresentationSource(url.searchParams.get('src'), url.origin, [
    PUBLIC_ASSET_BASE_URL,
    PUBLIC_PREVIEW_ASSET_BASE_URL,
  ])
  if (!source) throw error(400, 'Unsupported image presentation source')
  const upstream = await fetch(source, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(8000),
  })
  const contentType = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !upstream.body)
    throw error(404, 'Image presentation source unavailable')
  if (!/^image\/(png|jpeg|webp|avif)(?:;|$)/i.test(contentType))
    throw error(415, 'Unsupported presentation image')
  const maxBytes = 8 * 1024 * 1024
  if (Number(upstream.headers.get('content-length')) > maxBytes)
    throw error(413, 'Presentation image too large')
  let received = 0
  // Bound streamed bodies as well as responses that declare their size up front.
  const bounded = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength
        if (received > maxBytes) throw new Error('Presentation image too large')
        controller.enqueue(chunk)
      },
    }),
  )
  return new Response(bounded, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  })
}
