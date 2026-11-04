interface TelegramCallGatewayEnv {
  CALLS: Fetcher
}

/** Public WebSocket gateway; all account control stays on the private Telegram binding. */
export default {
  async fetch(request: Request, env: TelegramCallGatewayEnv): Promise<Response> {
    const url = new URL(request.url)
    const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
      .split(',')
      .map(value => value.trim())
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket' ||
      !/^\/calls\/[a-f0-9]{64}$/.test(url.pathname) ||
      url.search
    )
      return new Response('Not found', { status: 404 })
    const origin = request.headers.get('origin')
    if (
      !origin ||
      protocols.length !== 2 ||
      !protocols.includes('hype.telegram.v1') ||
      !protocols.some(value => /^token\.[a-f0-9]{64}$/.test(value))
    )
      return new Response('Unauthorized', { status: 401 })
    try {
      return await env.CALLS.fetch(
        new Request(`https://calls.internal${url.pathname}`, {
          headers: {
            Upgrade: 'websocket',
            Origin: origin,
            'Sec-WebSocket-Protocol': protocols.join(', '),
          },
        }),
      )
    } catch {
      return new Response('Call connection unavailable', { status: 503 })
    }
  },
}
