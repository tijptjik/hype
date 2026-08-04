/// <reference types="@cloudflare/workers-types" />

type Env = {
  APP_BASE_URL: string
  SCHEDULER_SECRET: string
  ANONYMOUS_CLEANUP_TOKEN: string
  MAP_REFRESH_TOKEN: string
  RENDER_REFRESH_KINDS?: string
  RENDER_REFRESH_SINCE_HOURS?: string
}

const RENDER_REFRESH_CRON = '0 * * * *'
const ANONYMOUS_CLEANUP_CRON = '15 3 * * *'

/**
 * Checks a manual scheduler request against the configured scheduler secret.
 *
 * @param request - Incoming request that may contain a Bearer credential.
 * @param expected - Configured scheduler secret, if the binding is available.
 * @returns Whether both credentials are present and match in constant time.
 */
const hasValidSchedulerCredential = (request: Request, expected?: string): boolean => {
  const credential = request.headers.get('authorization')
  if (!expected || !credential) {
    return false
  }

  const supplied = credential.startsWith('Bearer ') ? credential.slice(7) : ''
  const suppliedBytes = new TextEncoder().encode(supplied)
  const expectedBytes = new TextEncoder().encode(expected)
  let difference = suppliedBytes.length ^ expectedBytes.length
  const length = Math.max(suppliedBytes.length, expectedBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (suppliedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0)
  }
  return difference === 0
}

/**
 * Builds the bounded render-refresh request URL for the current environment.
 *
 * @param env - Scheduler configuration and application origin.
 * @returns Absolute application URL with refresh query parameters.
 */
const buildRenderRefreshUrl = (env: Env): string => {
  const url = new URL('/api/mapRenders/refresh', env.APP_BASE_URL)

  url.searchParams.set('mode', 'enqueue')
  url.searchParams.set('kinds', env.RENDER_REFRESH_KINDS ?? 'layers,projects')
  url.searchParams.set('sinceHours', env.RENDER_REFRESH_SINCE_HOURS ?? '24')

  return url.toString()
}

/**
 * Requests periodic map-render planning from the environment's app Worker.
 *
 * @param env - Scheduler bindings and render-refresh credential.
 * @returns The bounded JSON response from the refresh endpoint.
 */
const triggerRenderRefresh = async (env: Env): Promise<Response> =>
  fetch(buildRenderRefreshUrl(env), {
    method: 'POST',
    headers: {
      'x-map-render-refresh-token': env.MAP_REFRESH_TOKEN,
    },
  })

/**
 * Requests daily guest-account retention cleanup from the environment's app Worker.
 *
 * @param env - Scheduler bindings and the shared environment-specific credential.
 * @returns The bounded JSON response from the maintenance endpoint.
 */
const triggerAnonymousCleanup = async (env: Env): Promise<Response> =>
  fetch(new URL('/api/maintenance/anonymous-cleanup', env.APP_BASE_URL), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.ANONYMOUS_CLEANUP_TOKEN}`,
    },
  })

export default {
  /**
   * Lightweight health endpoint for ad-hoc verification and manual triggering.
   *
   * @param request Incoming HTTP request.
   * @param env Worker environment bindings and secrets.
   * @returns Health response or manual trigger result.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        appBaseUrl: env.APP_BASE_URL,
        kinds: env.RENDER_REFRESH_KINDS ?? 'layers,projects',
        sinceHours: env.RENDER_REFRESH_SINCE_HOURS ?? '24',
      })
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      if (!hasValidSchedulerCredential(request, env.SCHEDULER_SECRET)) {
        return new Response('Unauthorized', { status: 401 })
      }
      const response = await triggerRenderRefresh(env)
      const body = await response.text()

      return new Response(body, {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
        },
      })
    }

    return new Response('Not found', { status: 404 })
  },

  /**
   * Scheduled worker entry point for declared application maintenance jobs.
   *
   * @param controller Cloudflare scheduled event controller.
   * @param env Worker environment bindings and secrets.
   * @returns Promise that resolves when the refresh trigger completes.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    let task: 'anonymous-cleanup' | 'render-refresh'
    let response: Response

    // Dispatch only declared schedules so a new cron cannot silently run the wrong job.
    switch (controller.cron) {
      case RENDER_REFRESH_CRON:
        task = 'render-refresh'
        response = await triggerRenderRefresh(env)
        break
      case ANONYMOUS_CLEANUP_CRON:
        task = 'anonymous-cleanup'
        response = await triggerAnonymousCleanup(env)
        break
      default:
        throw new Error(`Unknown maintenance schedule: ${controller.cron}`)
    }

    if (!response.ok) {
      throw new Error(
        `Scheduled ${task} failed (${response.status} ${response.statusText}): ${await response.text()}`,
      )
    }

    console.log(
      JSON.stringify({
        task,
        outcome: 'completed',
        response: await response.text(),
      }),
    )
  },
} satisfies ExportedHandler<Env>
