// SVELTEKIT
import { error } from '@sveltejs/kit'
// API
import { setupRequestHandler } from '#lib/api/index.js'
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
// TYPES
import type { RequestEvent } from '@sveltejs/kit'

/** Authorize shared building-map authoring before accessing worker jobs or source scans.
 * @param event Request event. @returns Authorized request context.
 */
export async function interiorContext(event: RequestEvent) {
  const ctx = {
    ...(await setupRequestHandler({
      locals: event.locals,
      platform: event.locals.platform,
      request: event.request,
    })),
    event,
  }
  if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
  await authorizeExteriorLocation(ctx, event.params.id!)
  return ctx
}

/** Call only the configured private extraction adapter; clients never provide a worker URL.
 * @param event Request bindings. @param path Fixed job resource. @param init HTTP options.
 * @returns Worker response, or a useful unavailable error.
 */
export async function floorplanWorker(
  event: RequestEvent,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const env = event.locals.platform.env as unknown as {
    FLOORPLAN_WORKER_URL?: string
    FLOORPLAN_WORKER_TOKEN?: string
  }
  if (!env.FLOORPLAN_WORKER_URL || !env.FLOORPLAN_WORKER_TOKEN)
    error(503, 'Floor-plan extraction worker is not configured.')
  const url = new URL(path, env.FLOORPLAN_WORKER_URL)
  const response = await fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      ...init.headers,
      Authorization: 'Bearer ' + env.FLOORPLAN_WORKER_TOKEN,
    },
  })
  if (!response.ok)
    error(
      response.status === 429 ? 429 : 502,
      'Floor-plan worker could not process the request.',
    )
  return response
}
