type Env = {
  APP_BASE_URL: string
  MAP_PREVIEW_REFRESH_TOKEN: string
  PREVIEW_REFRESH_KINDS?: string
  PREVIEW_REFRESH_SINCE_HOURS?: string
}

const buildRefreshUrl = (env: Env): string => {
  const url = new URL('/api/mapPreviews/refresh', env.APP_BASE_URL)

  url.searchParams.set('mode', 'enqueue')
  url.searchParams.set('kinds', env.PREVIEW_REFRESH_KINDS ?? 'layers,projects')
  url.searchParams.set('sinceHours', env.PREVIEW_REFRESH_SINCE_HOURS ?? '24')

  return url.toString()
}

const triggerRefresh = async (env: Env): Promise<Response> =>
  fetch(buildRefreshUrl(env), {
    method: 'POST',
    headers: {
      'x-map-preview-refresh-token': env.MAP_PREVIEW_REFRESH_TOKEN,
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
        kinds: env.PREVIEW_REFRESH_KINDS ?? 'layers,projects',
        sinceHours: env.PREVIEW_REFRESH_SINCE_HOURS ?? '24',
      })
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const response = await triggerRefresh(env)
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
   * Scheduled worker entry point for periodic preview refresh planning.
   *
   * @param _controller Cloudflare scheduled event controller.
   * @param env Worker environment bindings and secrets.
   * @returns Promise that resolves when the refresh trigger completes.
   */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const response = await triggerRefresh(env)

    if (!response.ok) {
      throw new Error(
        `Preview refresh trigger failed (${response.status} ${response.statusText}): ${await response.text()}`,
      )
    }

    console.log(await response.text())
  },
} satisfies ExportedHandler<Env>
