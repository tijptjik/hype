// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// SHARING
import { loadShareResource } from '#lib/sharing/resource.server.js'
// TYPES
import type { RequestHandler } from './$types'

/** Returns anonymously visible sharing data; never escalates using the caller session.
 * @param event Resource reference and hub. @returns Public share data or 404.
 */
export const GET: RequestHandler = async ({ params, locals, url, fetch }) => {
  const { kind, ref } = params
  if (
    kind !== 'feature' &&
    kind !== 'layer' &&
    kind !== 'project' &&
    kind !== 'organisation'
  )
    error(404)
  const resource = await loadShareResource(locals, kind, ref)
  if (!resource) error(404, 'This resource is not publicly available')
  if (url.searchParams.get('image') === '1') {
    // The upstream URL comes only from the public resource reader, never user input.
    const response = await fetch(new URL(resource.image, url.origin))
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.startsWith('image/'))
      error(502, 'Preview image unavailable')
    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment',
        'Cache-Control': 'private, no-store',
      },
    })
  }
  return json(resource, { headers: { 'Cache-Control': 'private, no-store' } })
}
