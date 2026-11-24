// SVELTE
import { error, isHttpError, json, type RequestHandler } from '@sveltejs/kit'

/** Fetch an idempotent basemap resource, retrying one interrupted read within 30 seconds.
 * @param fetcher Server request transport.
 * @param target Allowlisted upstream URL.
 * @param key Server-side credential.
 * @param signal Incoming request cancellation.
 * @returns Tile metadata or a streaming vector tile response.
 */
async function fetchBasemap(
  fetcher: typeof fetch,
  target: URL,
  key: string,
  signal: AbortSignal,
): Promise<Response | { tiles: string[]; [key: string]: unknown }> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(15_000)
    try {
      const response = await fetcher(target, {
        headers: { 'x-api-key': key },
        redirect: 'error',
        signal: AbortSignal.any([signal, timeout]),
      })
      if (!response.ok) error(502, `Basemap upstream returned ${response.status}`)
      if (!target.pathname.endsWith('.json')) return response
      const data = await response.json()
      if (
        !Array.isArray(data?.tiles) ||
        !data.tiles.every((tile: unknown) => typeof tile === 'string')
      )
        error(502, 'Invalid basemap metadata')
      return data
    } catch (cause) {
      signal.throwIfAborted()
      if (isHttpError(cause)) throw cause
      if (cause instanceof SyntaxError) error(502, 'Invalid basemap metadata')
      if (!attempt) continue
      if (timeout.aborted || (cause instanceof Error && cause.name === 'TimeoutError'))
        error(504, 'Basemap upstream timed out')
      error(502, 'Basemap upstream could not be reached')
    }
  }
}

/** Authenticate local basemap requests without sending the server credential to the browser.
 * @param event Local tile path, cache version and platform credentials.
 * @returns TileJSON with same-origin tile URLs, or the requested vector tile.
 * @remarks Development only; the fixed host and path allowlist prevent arbitrary proxy requests.
 */
export const GET: RequestHandler = async ({ params, url, locals, fetch, request }) => {
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
  const response = await fetchBasemap(fetch, target, key, request.signal)
  // Rewrite only this known tile family; upstream authentication never enters TileJSON.
  if (!(response instanceof Response)) {
    const data = response
    data.tiles = data.tiles.map(tile => {
      if (!URL.canParse(tile)) error(502, 'Unexpected basemap tile template')
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
