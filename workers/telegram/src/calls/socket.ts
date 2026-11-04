import type { BridgeCalls } from '@hype/messaging-bridge/types'
import type { CallOwnerEvent, CallStart, TelegramCalls } from './controller'
import { signalMessage } from './signaling'

/** Hash capabilities before durable storage; the clear token exists only in the response. */
async function digest(token: string): Promise<string> {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  ).toString('hex')
}

/** Single-use, origin-bound capabilities issued only by Hype's authorised account RPC. */
export class CallTickets {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS telegram_call_tickets (digest TEXT PRIMARY KEY, origin TEXT NOT NULL, viewer TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }

  async issue(
    origin: string,
    viewer: string,
  ): Promise<{ token: string; expiresAt: number }> {
    const url = new URL(origin)
    if (
      url.origin !== origin ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )) ||
      !/^[a-f0-9]{64}$/.test(viewer)
    )
      throw new Error('Invalid call capability request')
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      'hex',
    )
    const hash = await digest(token),
      expiresAt = Date.now() + 30_000
    this.storage.sql.exec(
      'DELETE FROM telegram_call_tickets WHERE expires<=?',
      Date.now(),
    )
    if (
      this.storage.sql
        .exec<{ count: number }>('SELECT count(*) AS count FROM telegram_call_tickets')
        .one().count >= 4
    )
      throw new Error('Too many pending call connections')
    this.storage.sql.exec(
      'INSERT INTO telegram_call_tickets VALUES (?, ?, ?, ?)',
      hash,
      origin,
      viewer,
      expiresAt,
    )
    await this.storage.sync()
    return { token, expiresAt }
  }

  async consume(token: string, origin: string): Promise<string | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null
    const rows = this.storage.sql
      .exec<{ viewer: string }>(
        'DELETE FROM telegram_call_tickets WHERE digest=? AND origin=? AND expires>? RETURNING viewer',
        await digest(token),
        origin,
        Date.now(),
      )
      .toArray()
    await this.storage.sync()
    return rows[0]?.viewer ?? null
  }
}

/** One browser owns the account's live call, with bounded messages and explicit cleanup. */
export class CallSocket {
  private socket?: WebSocket
  private owner = ''
  private viewer = ''
  private closing?: Promise<void>
  private readonly pending = new Set<Promise<void>>()
  private poll?: ReturnType<typeof setInterval>
  private heartbeat = 0
  private opened = 0
  private window = 0
  private commands = 0
  private begun = false
  private previous = ''

  constructor(
    private readonly calls: TelegramCalls,
    private readonly viewerActive: (viewer: string) => boolean,
    private readonly keepAlive: (task: Promise<void>) => void,
  ) {}

  open(viewer: string): Response {
    if (this.socket || this.closing || this.pending.size)
      return new Response('Another operator owns the call connection', { status: 409 })
    if (!this.viewerActive(viewer))
      return new Response('Viewer expired', { status: 401 })
    const pair = new WebSocketPair()
    this.socket = pair[1]
    this.owner = `${viewer}:${crypto.randomUUID()}`
    this.viewer = viewer
    this.heartbeat = this.opened = this.window = Date.now()
    this.commands = 0
    this.begun = false
    this.previous = ''
    this.socket.addEventListener('message', this.message)
    this.socket.addEventListener('close', this.closed)
    this.socket.addEventListener('error', this.closed)
    this.socket.accept()
    this.poll = setInterval(() => {
      if (
        !this.viewerActive(this.viewer) ||
        Date.now() - this.heartbeat > 25_000 ||
        (!this.begun && Date.now() - this.opened > 15_000)
      ) {
        this.closed()
        return
      }
      this.track(this.calls.tick())
      this.publish(this.calls.snapshot())
    }, 500)
    this.publish(this.calls.snapshot())
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'Sec-WebSocket-Protocol': 'hype.telegram.v1' },
    })
  }

  /** Deliver keys' public setup and decrypted signalling to their exact owner, never to observers. */
  deliver(owner: string, event: CallOwnerEvent): void {
    if (owner === this.owner) this.send(event)
  }

  publish(snapshot: BridgeCalls): void {
    const text = JSON.stringify({ kind: 'snapshot', ...snapshot })
    if (text === this.previous) return
    this.previous = text
    if (this.socket) {
      try {
        this.socket.send(text)
      } catch {
        this.closed()
      }
    }
  }

  /** Keep the slot reserved until commands borrowing the account client have settled. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    if (!this.socket && !this.pending.size) return Promise.resolve()
    clearInterval(this.poll)
    const socket = this.socket
    this.socket = undefined
    socket?.removeEventListener('message', this.message)
    socket?.removeEventListener('close', this.closed)
    socket?.removeEventListener('error', this.closed)
    try {
      socket?.close(1000, 'Call connection ended')
    } catch {
      /* Already closed. */
    }
    const owner = this.owner
    this.closing = (async () => {
      await this.calls.end(owner).catch(() => {})
      await Promise.allSettled([...this.pending])
      await this.calls.end(owner).catch(() => {})
    })().finally(() => {
      this.closing = undefined
    })
    return this.closing
  }

  private closed = (): void => {
    this.keepAlive(this.close())
  }
  private send(value: unknown): void {
    if (this.socket) {
      try {
        this.socket.send(JSON.stringify(value))
      } catch {
        this.closed()
      }
    }
  }
  private track(task: Promise<void>): void {
    this.pending.add(task)
    this.keepAlive(
      task
        .catch(() => {
          this.send({ kind: 'error', message: 'Telegram call operation failed' })
          this.closed()
        })
        .finally(() => {
          this.pending.delete(task)
        }),
    )
  }

  private message = (event: MessageEvent): void => {
    if (!this.socket) return
    if (!this.viewerActive(this.viewer)) {
      this.closed()
      return
    }
    if (Date.now() - this.window > 1000) {
      this.window = Date.now()
      this.commands = 0
    }
    if (
      ++this.commands > 64 ||
      typeof event.data !== 'string' ||
      event.data.length > 64 * 1024
    ) {
      this.closed()
      return
    }
    if (event.data === 'ping') {
      this.heartbeat = Date.now()
      try {
        this.socket.send('pong')
      } catch {
        this.closed()
      }
      return
    }
    try {
      const value: unknown = JSON.parse(event.data)
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid call command')
      const input = value as Record<string, unknown>,
        keys = Object.keys(input).sort().join(',')
      if (input.kind === 'signal' && keys === 'kind,message') {
        this.track(this.calls.sendSignal(this.owner, signalMessage(input.message)))
        return
      }
      if (input.kind === 'connected' && keys === 'kind') {
        this.calls.connected(this.owner)
        return
      }
      if (
        input.kind === 'mute' &&
        keys === 'kind,muted' &&
        typeof input.muted === 'boolean'
      ) {
        this.calls.mute(this.owner, input.muted)
        return
      }
      if (input.kind === 'end' && keys === 'kind') {
        this.closed()
        return
      }
      const outgoing = input.kind === 'outgoing'
      if (
        (!outgoing && input.kind !== 'answer') ||
        this.begun ||
        typeof input.requestId !== 'string' ||
        !/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.requestId)
      )
        throw new Error('Invalid call attempt')
      const expected = outgoing ? 'kind,requestId,to' : 'id,kind,requestId'
      if (
        keys !== expected &&
        !(keys === `${expected},video` && typeof input.video === 'boolean')
      )
        throw new Error('Invalid call fields')
      const peer = outgoing ? input.to : input.id
      if (typeof peer !== 'string') throw new Error('Invalid call peer')
      // Telegram users use positive safe integers; phone call IDs are signed TL longs.
      const validPeer = outgoing
        ? /^[1-9]\d{0,15}$/.test(peer) && Number.isSafeInteger(Number(peer))
        : /^-?[1-9]\d{0,18}$/.test(peer) &&
          BigInt(peer) >= -9223372036854775808n &&
          BigInt(peer) <= 9223372036854775807n
      if (!validPeer) throw new Error('Invalid call peer')
      const start: CallStart = outgoing
        ? {
            kind: 'outgoing',
            requestId: input.requestId,
            to: peer,
            video: input.video === true,
          }
        : {
            kind: 'answer',
            requestId: input.requestId,
            id: peer,
            video: input.video === true,
          }
      this.begun = true
      this.track(this.calls.begin(this.owner, start))
    } catch {
      this.closed()
    }
  }
}
