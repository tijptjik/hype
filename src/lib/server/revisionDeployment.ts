// TYPES
import type { Handle } from '@sveltejs/kit/hooks'

/** Keep a managed deployment closed until its exact release is activated.
 * @param input SvelteKit request and resolver.
 * @returns Public release readiness, maintenance response, or the normal application.
 * @remarks The database fence protects older apps and background writers too. This hook
 * supplies a readable maintenance response and proves the newly deployed worker's release identity.
 */
export const handleRevisionDeployment: Handle = async ({ event, resolve }) => {
  const env = event.locals.platform?.env
  if (!env?.REVISION_RELEASE) return resolve(event)
  const headers = { 'cache-control': 'no-store', 'retry-after': '30' }
  try {
    const state = await env.DB.prepare(
      'SELECT planHash,phase,writable FROM _revisionDeployment WHERE singleton=1',
    ).first<{ planHash: string; phase: string; writable: number }>()
    const ready =
      state?.planHash === env.REVISION_RELEASE &&
      state.writable === 0 &&
      ['verified', 'active'].includes(state.phase)
    if (
      event.url.pathname === '/api/health/revisions' &&
      event.request.method === 'GET'
    )
      return Response.json(
        {
          contract: 1,
          release: env.REVISION_RELEASE,
          phase: state?.phase ?? 'missing',
          ready,
        },
        { status: ready ? 200 : 503, headers },
      )
    if (!ready || state?.phase !== 'active')
      return new Response('Maintenance in progress. Please try again shortly.', {
        status: 503,
        headers,
      })
  } catch {
    return new Response('Maintenance in progress. Please try again shortly.', {
      status: 503,
      headers,
    })
  }
  return resolve(event)
}
