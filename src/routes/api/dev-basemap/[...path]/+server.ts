// SVELTE
import { error, json, type RequestHandler } from '@sveltejs/kit'

/** Authenticate local basemap requests without sending the server credential to the browser.
 * @param event Local tile path, cache version and platform credentials.
 * @returns TileJSON with same-origin tile URLs, or the requested vector tile.
 * @remarks Development only; the fixed host and path allowlist prevent arbitrary proxy requests.
 */
export const GET: RequestHandler = async ({ params, url, locals, fetch }) => {
  if (!import.meta.env.DEV) error(404, 'Not found')
  const path = params.path ?? ''
  if (!/^hongkong-latest(?:\.json|\/\d{1,2}\/\d{1,7}\/\d{1,7}\.mvt)$/.test(path))
    error(404, 'Unknown basemap resource')
  const key =
    locals.platform?.env.SAANSEOI_API_KEY ?? locals.platform?.env.VITE_SAANSEOI_API_KEY
  if (!key) error(503, 'Local basemap credential is not configured')
  const target = new URL(path, 'https://tiles.saanseoi.hk/')
  const version = url.searchParams.get('v')
  if (version && /^[a-zA-Z0-9-]{1,80}$/.test(version))
    target.searchParams.set('v', version)
  const response = await fetch(target, {
    headers: { 'x-api-key': key },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) error(502, `Basemap upstream returned ${response.status}`)
  // Rewrite only this known tile family; upstream authentication never enters TileJSON.
  if (path.endsWith('.json')) {
    const data = (await response.json()) as { tiles: string[]; [key: string]: unknown }
    data.tiles = data.tiles.map(tile => {
      const parsed = new URL(tile)
      const template = decodeURIComponent(parsed.pathname)
      if (
        parsed.origin !== target.origin ||
        template !== '/hongkong-latest/{z}/{x}/{y}.mvt'
      )
        error(502, 'Unexpected basemap tile template')
      const cacheVersion = parsed.searchParams.get('v')
      const query = cacheVersion ? `?v=${encodeURIComponent(cacheVersion)}` : ''
      return `${url.origin}/api/dev-basemap${template}${query}`
    })
    return json(data, { headers: { 'Cache-Control': 'private, max-age=60' } })
  }
  return new Response(response.body, {
    headers: {
      'Content-Type':
        response.headers.get('Content-Type') ?? 'application/vnd.mapbox-vector-tile',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
