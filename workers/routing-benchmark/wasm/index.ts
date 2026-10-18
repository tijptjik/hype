// THIRD PARTY
import { Router, RoutingError } from 'valhalla-server/cloudflare'
// PROJECT
import { authorized, parseRoute, json } from '../shared'

// A reusable engine capability contains no request-owned I/O promises.
let router: Router | undefined
let isolateId: string | undefined
let requests = 0

export default {
  /**
   * Runs the experimental WASM engine against private R2 graph data.
   * @param request - Authenticated route request.
   * @param env - Generated Worker bindings and benchmark secret.
   * @param context - Current request lifetime.
   * @returns Native route JSON and diagnostic metadata.
   */
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext,
  ): Promise<Response> {
    if (!(await authorized(request, env.BENCHMARK_TOKEN)))
      return json({ error: 'Unauthorized' }, 401)
    isolateId ??= crypto.randomUUID()
    if (request.method === 'GET' && new URL(request.url).pathname === '/dataset') {
      const archive = await env.GRAPH_DATA.head('datasets/hk-2026-10-01/graph.tar')
      return json({
        archive: archive ? { size: archive.size, etag: archive.httpEtag } : null,
      })
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/route')
      return json({ error: 'POST /route' }, 404)
    let input: Awaited<ReturnType<typeof parseRoute>>
    try {
      input = await parseRoute(request)
    } catch (error) {
      return json({ error: String(error) }, 400)
    }
    if (input.costing === 'motor_scooter')
      return json({ error: 'WASM SDK does not expose motor_scooter' }, 422)
    const started = Date.now()
    const firstRequest = !router
    router ??= new Router({
      source: { type: 'r2', bucket: env.GRAPH_DATA, manifestKey: env.MANIFEST_KEY },
      wasmMemory: { initialMiB: 64, maximumMiB: 96 },
      memoryBudgetBytes: 64 * 1024 * 1024,
      searchMemory: {
        astar: 4096,
        bidirectionalAstar: 4096,
        clearReservedMemory: true,
      },
      maxQueuedRoutes: 8,
      routeTimeoutMs: 25000,
    })
    requests += 1
    try {
      const points: [
        (typeof input.locations)[number],
        (typeof input.locations)[number],
      ] = [input.locations[0], input.locations[1]]
      const routeInput =
        input.costing === 'auto'
          ? { locations: points, costing: 'auto' as const }
          : input.costing === 'bicycle'
            ? { locations: points, costing: 'bicycle' as const }
            : { locations: points, costing: 'pedestrian' as const }
      const result = await router.route(routeInput, { context, signal: request.signal })
      return json(
        {
          native: result.native,
          dataset: result.dataset,
          diagnostics: result.diagnostics,
          benchmark: {
            engine: 'wasm',
            isolateId,
            firstRequest,
            requests,
            colo: request.cf?.colo,
            elapsedMs: Date.now() - started,
          },
        },
        200,
        Date.now() - started,
      )
    } catch (error) {
      const detail =
        error instanceof RoutingError ? error.toJSON() : { message: String(error) }
      const status =
        error instanceof RoutingError &&
        ['NO_ROUTE', 'LOCATION_NOT_FOUND'].includes(error.code)
          ? 404
          : error instanceof RoutingError &&
              ['QUEUE_TIMEOUT', 'QUEUE_FULL'].includes(error.code)
            ? 503
            : 500
      return json(
        {
          error: detail,
          benchmark: { engine: 'wasm', isolateId, firstRequest, requests },
        },
        status,
        Date.now() - started,
      )
    }
  },
} satisfies ExportedHandler<Env>
