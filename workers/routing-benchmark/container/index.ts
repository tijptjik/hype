// THIRD PARTY
import { Container, getContainer } from '@cloudflare/containers'
// PROJECT
import { authorized, parseRoute, json } from '../shared'

/** Shared native engine started by navigation intent and stopped after inactivity. */
export class NativeRouting extends Container<Env> {
  defaultPort = 8002
  sleepAfter = '2m'

  /**
   * Starts the engine without requiring route parameters.
   * @returns Readiness acknowledgement after the routing port accepts requests.
   * @remarks Routing can independently start the engine if warm-up is skipped.
   */
  async warmup(): Promise<{ ready: true; idleTimeoutSeconds: number }> {
    await this.startAndWaitForPorts()
    this.renewActivityTimeout()
    return { ready: true, idleTimeoutSeconds: 120 }
  }

  /**
   * Terminates an idle engine without waiting for Valhalla's graceful drain.
   * @returns Completion once the container has actually stopped.
   * @remarks The SDK defers expiry while proxied requests remain in flight.
   */
  override async onActivityExpired(): Promise<void> {
    await this.destroy()
  }
}

export default {
  /**
   * Forwards validated benchmark routes to an isolated native container.
   * @param request - Authenticated benchmark request.
   * @param env - Generated container binding and secret.
   * @returns Native route JSON with Worker-to-container wall time.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await authorized(request, env.BENCHMARK_TOKEN)))
      return json({ error: 'Unauthorized' }, 401)
    const path = new URL(request.url).pathname
    const container = getContainer(env.NATIVE, 'hk-benchmark')
    if (request.method === 'GET' && path === '/state') {
      return json({ state: await container.getState() })
    }
    if (request.method === 'POST' && path === '/warmup') {
      const started = Date.now()
      try {
        return json(await container.warmup(), 200, Date.now() - started)
      } catch (error) {
        return json({ error: String(error) }, 502, Date.now() - started)
      }
    }
    if (request.method === 'POST' && path === '/stop') {
      // stop() only signals SIGTERM; destroy() awaits a real stop before cold tests.
      await container.destroy()
      return json({ stopped: true, state: await container.getState() })
    }
    if (request.method !== 'POST' || path !== '/route')
      return json({ error: 'Unknown routing endpoint' }, 404)
    let input: Awaited<ReturnType<typeof parseRoute>>
    try {
      input = await parseRoute(request)
    } catch (error) {
      return json({ error: String(error) }, 400)
    }
    const started = Date.now()
    try {
      const response = await container.fetch(
        new Request('http://container/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      )
      const native: unknown = await response.json()
      return json(
        {
          native,
          benchmark: {
            engine: 'native',
            colo: request.cf?.colo,
            elapsedMs: Date.now() - started,
          },
        },
        response.status,
        Date.now() - started,
      )
    } catch (error) {
      return json({ error: String(error) }, 502, Date.now() - started)
    }
  },
} satisfies ExportedHandler<Env>
