// ANALYTICS
import { clientUsageSchema } from '#lib/analytics/productUsage.js'
import { recordProductUsage } from '#lib/analytics/productUsage.server.js'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Accepts a bounded same-origin product interaction from the public app.
 * @param event Request and server-resolved hub/bindings.
 * @returns 204 when accepted; 400/403/413/415 for invalid requests.
 * @remarks Contribution events are server-only. No user, IP, query or free text is stored.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin)
    return new Response(null, { status: 403 })
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return new Response(null, { status: 415 })

  // Bound the actual stream, including requests without Content-Length.
  const reader = request.body?.getReader()
  if (!reader) return new Response(null, { status: 400 })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) {
        await reader.cancel()
        return new Response(null, { status: 413 })
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const parsed = clientUsageSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)),
    )
    if (!parsed.success) return new Response(null, { status: 400 })
    recordProductUsage(
      locals.platform?.env.PRODUCT_USAGE,
      {
        ...parsed.data,
        source: 'client',
        hubId: locals.hub?.id,
      },
      locals.platform?.env.ENVIRONMENT,
    )
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 400 })
  } finally {
    reader.releaseLock()
  }
}
