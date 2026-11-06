// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DOMAIN
import { parseRevisionTransformOptions } from './revisionTransformOptions'
// TYPES
import type { Fetcher } from '@cloudflare/workers-types'

/**
 * Sends verified revision bytes to the app-owned asset Worker's private WASM transformer.
 * @param binding Private service binding to the ImageRevisionTransformer entrypoint.
 * @param bytes Original bytes already checked against the asset version's digest and size.
 * @param mediaType Retained source media type.
 * @param metadata Exact image revision metadata, never a mutable sidecar.
 * @param url Display options; absent `t` means exact original-file delivery.
 * @returns A transformed response, or null when the original bytes were requested.
 * @remarks The service receives bytes, not a source URL. It cannot fetch a latest version,
 * resolve a mutable sidecar, persist private derivatives or use Cloudflare Images.
 */
export async function transformImageRevision(
  binding: Fetcher | undefined,
  bytes: ArrayBuffer,
  mediaType: string,
  metadata: unknown,
  url: URL,
): Promise<Response | null> {
  if (url.searchParams.get('t') === null) return null
  try {
    parseRevisionTransformOptions(url)
  } catch (cause) {
    throw error(
      400,
      cause instanceof Error ? cause.message : 'Invalid image transformation',
    )
  }
  const stored = z
    .object({
      renderRotation: z
        .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
        .nullish(),
    })
    .safeParse(metadata)
  if (!stored.success) throw error(409, 'Image rotation metadata requires migration')
  if (!binding) throw error(503, 'Asset transformer service unavailable')
  const target = new URL('https://revision-transform.internal/')
  for (const key of ['t', 'format', 'quality', 'gravity']) {
    const value = url.searchParams.get(key)
    if (value !== null) target.searchParams.set(key, value)
  }
  // Only the immutable server-loaded rotation crosses this boundary, never a URL override.
  // History expansion can briefly saturate the private worker; retry only its explicit capacity response.
  const send = (): Promise<Response> =>
    binding.fetch(target.href, {
      method: 'POST',
      body: bytes,
      headers: {
        'content-type': mediaType,
        'x-revision-render-rotation': String(stored.data.renderRotation ?? 0),
      },
    }) as unknown as Promise<Response>
  let response = await send()
  for (
    let retry = 0;
    retry < 2 && response.status === 503 && response.headers.get('retry-after') === '2';
    retry++
  ) {
    await response.body?.cancel()
    await new Promise(resolve => setTimeout(resolve, 2000))
    response = await send()
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw error(
      response.status >= 400 && response.status <= 599 ? response.status : 502,
      'Asset revision transformation failed',
    )
  }
  return new Response(response.body as unknown as ReadableStream<Uint8Array>, {
    headers: { 'content-type': response.headers.get('content-type') ?? 'image/webp' },
  })
}
