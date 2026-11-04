import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import { proxyRelay } from './socket-proxy'

/** An ephemeral native packet pipe, separate from durable WhatsApp account state. */
export class WhatsoverRelay extends DurableObject<RelayEnv> {
  private token = ''
  private starting?: Promise<void>

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.token =
        (await ctx.storage.get<string>('token')) ||
        crypto.randomUUID() + crypto.randomUUID()
      await ctx.storage.put('token', this.token)
      if (ctx.container?.running) await ctx.container.setInactivityTimeout(60_000)
    })
  }

  /** Start on demand and retain a shared readiness promise across concurrent requests. */
  private async ready(): Promise<void> {
    if (!this.starting)
      this.starting = this.start().finally(() => {
        this.starting = undefined
      })
    return this.starting
  }

  private async start(): Promise<void> {
    const container = this.ctx.container
    if (!container) throw new Error('Voice relay container is not configured')
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: 'lite',
        enableInternet: true,
        env: { WHATSOVER_RELAY_TOKEN: this.token },
      })
    }
    await container.setInactivityTimeout(60_000)
    const port = container.getTcpPort(8080)
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const response = await port.fetch('http://relay/health', {
          signal: AbortSignal.timeout(1000),
        })
        await response.body?.cancel()
        if (response.ok) return
      } catch {
        /* A newly assigned instance may still be opening its port. */
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error('Voice relay did not become ready')
  }

  /** Internal startup-only requests and media upgrades share the same readiness check. */
  async fetch(request: Request): Promise<Response> {
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname.endsWith('/prewarm') &&
      !request.headers.has('upgrade')
    ) {
      await this.ready()
      return new Response(null, { status: 204 })
    }
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    ) {
      return new Response('Not found', { status: 404 })
    }
    await this.ready()
    const response = await this.ctx
      .container!.getTcpPort(8080)
      .fetch('http://relay/relay', {
        headers: { Upgrade: 'websocket', Authorization: `Bearer ${this.token}` },
      })
    if (response.status !== 101 || !response.webSocket) {
      await response.body?.cancel()
      return new Response('Voice relay unavailable', { status: 503 })
    }
    // Proxying actively avoids eviction mid-call; closing both ends lets the
    // inactivity timeout apply without a monitor promise extending the bill.
    return proxyRelay(response.webSocket)
  }

  /** Return only UDP reachability, never STUN's reflected address or environment. */
  async probe(): Promise<{ udpReachable: boolean }> {
    await this.ready()
    const process = await this.ctx.container!.exec(
      ['/usr/local/bin/whatsapp-relay', '--probe-udp'],
      {
        stdout: 'pipe',
        stderr: 'ignore',
        signal: AbortSignal.timeout(12_000),
      },
    )
    const output = await process.output()
    if (output.exitCode !== 0 || output.stdout.byteLength > 128)
      return { udpReachable: false }
    const result: unknown = JSON.parse(new TextDecoder().decode(output.stdout))
    return {
      udpReachable:
        typeof result === 'object' &&
        result !== null &&
        'udpReachable' in result &&
        result.udpReachable === true,
    }
  }
}

/** Bound only to Whatsover. This deployment has no public routes or workers.dev URL. */
export default class RelayService extends WorkerEntrypoint<RelayEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const match = /^\/([a-zA-Z0-9_-]{1,80})(\/prewarm)?$/.exec(url.pathname)
    if (
      !match ||
      url.search ||
      (match[2] && (request.method !== 'POST' || request.headers.has('upgrade')))
    )
      return new Response('Not found', { status: 404 })
    return this.env.RELAYS.getByName(match[1]).fetch(request)
  }

  async probe(): Promise<{ udpReachable: boolean }> {
    return this.env.RELAYS.getByName('qualification').probe()
  }
}
