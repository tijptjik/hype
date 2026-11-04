/** Public upgrade-only gateway. Account RPC and native relay access remain private. */
export default {
  async fetch(request: Request, env: VoiceGatewayEnv): Promise<Response> {
    const url = new URL(request.url)
    const protocols = (request.headers.get('sec-websocket-protocol') || '')
      .split(',')
      .map(value => value.trim())
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket' ||
      !/^\/voice\/[a-f0-9]{64}$/.test(url.pathname) ||
      url.search
    )
      return new Response('Not found', { status: 404 })
    if (
      !request.headers.get('origin') ||
      protocols.length !== 2 ||
      !protocols.includes('whatsover.v1') ||
      !protocols.some(value => /^token\.[a-f0-9]{64}$/.test(value))
    )
      return new Response('Unauthorized', { status: 401 })
    try {
      // Forward only the protocol capability and browser origin, never cookies or headers.
      return await env.VOICE.fetch(
        new Request(`https://voice.internal${url.pathname}`, {
          headers: {
            Upgrade: 'websocket',
            Origin: request.headers.get('origin')!,
            'Sec-WebSocket-Protocol': protocols.join(', '),
          },
        }),
      )
    } catch {
      return new Response('Voice connection unavailable', { status: 503 })
    }
  },
}
