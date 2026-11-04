/** Browser voice transport. Tickets and signaling attempts belong to one account. */
export type BeginCall =
  | { kind: 'outgoing'; requestId: string; to: string; video?: boolean }
  | { kind: 'answer'; requestId: string; id: string; video?: boolean }
type Command =
  | BeginCall
  | { kind: 'keyframe' }
  | { kind: 'mute'; muted: boolean }
  | { kind: 'end' }
  | { kind: 'reject'; id: string }

export interface VoiceEngine {
  snapshot(): unknown
  begin(
    input: BeginCall,
    output: (packet: Uint8Array) => void,
    cancelled: () => boolean,
  ): Promise<void>
  audio(bytes: Uint8Array): void
  video(bytes: Uint8Array): void
  keyframe(): void
  mute(muted: boolean): Promise<void>
  reject(id: string): Promise<void>
  end(): Promise<void>
}

/** Short-lived, single-use capabilities, never placed in URLs or stored in plaintext. */
export class VoiceTickets {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS voice_tickets (digest TEXT PRIMARY KEY, origin TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }

  async issue(origin: string): Promise<{ token: string; expiresAt: number }> {
    const url = new URL(origin)
    if (
      origin !== url.origin ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ))
    )
      throw new Error('Invalid voice origin')
    const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '')
    const digest = await hash(token)
    const expiresAt = Date.now() + 30_000
    this.storage.sql.exec('DELETE FROM voice_tickets WHERE expires<=?', Date.now())
    if (
      this.storage.sql
        .exec<{ count: number }>('SELECT COUNT(*) AS count FROM voice_tickets')
        .one().count >= 4
    )
      throw new Error('Too many pending voice connections')
    this.storage.sql.exec(
      'INSERT INTO voice_tickets VALUES (?, ?, ?)',
      digest,
      origin,
      expiresAt,
    )
    await this.storage.sync()
    return { token, expiresAt }
  }

  async consume(token: string, origin: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(token)) return false
    const digest = await hash(token)
    // Match and consume in a single SQLite statement, including concurrent upgrades.
    const used =
      this.storage.sql
        .exec(
          'DELETE FROM voice_tickets WHERE digest=? AND origin=? AND expires>? RETURNING digest',
          digest,
          origin,
          Date.now(),
        )
        .toArray().length === 1
    await this.storage.sync()
    return used
  }
}

async function hash(token: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Reject unknown fields, oversized commands and invalid identifiers before signaling. */
function command(text: string): Command {
  if (text.length > 512) throw new Error('Invalid voice command')
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('kind' in value))
    throw new Error('Invalid voice command')
  const v = value as Record<string, unknown>
  const keys = Object.keys(v).sort().join(',')
  const id = (key: string) =>
    typeof v[key] === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(v[key] as string)
  switch (v.kind) {
    case 'keyframe':
      if (keys === 'kind') return { kind: 'keyframe' }
      break
    case 'end':
      if (keys === 'kind') return { kind: 'end' }
      break
    case 'mute':
      if (keys === 'kind,muted' && typeof v.muted === 'boolean')
        return { kind: 'mute', muted: v.muted }
      break
    case 'reject':
      if (keys === 'id,kind' && id('id')) return { kind: 'reject', id: v.id as string }
      break
    case 'answer':
      if (
        (keys === 'id,kind,requestId' ||
          (keys === 'id,kind,requestId,video' && typeof v.video === 'boolean')) &&
        id('id') &&
        id('requestId')
      )
        return {
          kind: 'answer',
          id: v.id as string,
          requestId: v.requestId as string,
          ...(v.video === undefined ? {} : { video: v.video as boolean }),
        }
      break
    case 'outgoing':
      if (
        (keys === 'kind,requestId,to' ||
          (keys === 'kind,requestId,to,video' && typeof v.video === 'boolean')) &&
        id('requestId') &&
        typeof v.to === 'string' &&
        v.to.length <= 100 &&
        /^\+?[\d ()-]+$|^\d+@(s\.whatsapp\.net|lid)$/.test(v.to)
      )
        return {
          kind: 'outgoing',
          to: v.to,
          requestId: v.requestId as string,
          ...(v.video === undefined ? {} : { video: v.video as boolean }),
        }
      break
  }
  throw new Error('Invalid voice command')
}

/** One active browser per account; a disconnected browser always ends its call. */
export class VoiceConnection {
  private socket?: WebSocket
  private closing?: Promise<void>
  private pending = new Set<Promise<void>>()
  private poll?: ReturnType<typeof setInterval>
  private lastHeartbeat = 0
  private openedAt = 0
  private window = 0
  private frames = 0
  private videoMode = false
  private videoFrames = 0
  private videoBytes = 0
  private videoPending = 0
  private commands = 0
  private starting = false
  private controlling = false
  private closingRequested = false
  private stopRequested = false
  private previousSnapshot = ''

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly engine: VoiceEngine,
    private readonly keepAlive: (task: Promise<void>) => void,
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS voice_attempts (request_id TEXT PRIMARY KEY, created INTEGER NOT NULL)',
    )
  }

  open(): Response {
    if (this.socket || this.closing || this.pending.size)
      return new Response('Voice already connected', { status: 409 })
    const pair = new WebSocketPair()
    this.socket = pair[1]
    this.socket.binaryType = 'arraybuffer'
    this.closingRequested = false
    this.previousSnapshot = ''
    this.lastHeartbeat = this.openedAt = this.window = Date.now()
    this.frames =
      this.commands =
      this.videoFrames =
      this.videoBytes =
      this.videoPending =
        0
    this.videoMode = false
    this.socket.addEventListener('message', this.message)
    this.socket.addEventListener('close', this.closed)
    this.socket.addEventListener('error', this.closed)
    this.socket.accept()
    this.poll = setInterval(() => {
      if (
        Date.now() - this.lastHeartbeat > 25_000 ||
        Date.now() - this.openedAt > 2 * 60 * 60_000
      ) {
        this.closed()
        return
      }
      this.publish()
    }, 500)
    this.publish()
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'Sec-WebSocket-Protocol': 'whatsover.v1' },
    })
  }

  /** Retain the slot until all borrowed WASM calls settle, including pending setup. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    if (!this.socket && !this.pending.size) return Promise.resolve()
    this.closingRequested = true
    clearInterval(this.poll)
    const socket = this.socket
    this.socket = undefined
    socket?.removeEventListener('message', this.message)
    socket?.removeEventListener('close', this.closed)
    socket?.removeEventListener('error', this.closed)
    try {
      socket?.close(1000, 'Voice connection ended')
    } catch {
      /* Already closed. */
    }
    this.closing = (async () => {
      // End marks a pending setup cancelled; begin terminates its eventual handle.
      await this.engine.end().catch(() => {})
      await Promise.allSettled([...this.pending])
      await this.engine.end().catch(() => {})
    })().finally(() => {
      this.closing = undefined
    })
    return this.closing
  }

  private closed = (): void => {
    this.keepAlive(this.close())
  }

  private track(task: Promise<void>): void {
    this.pending.add(task)
    this.keepAlive(
      task.finally(() => {
        this.pending.delete(task)
      }),
    )
  }

  private send(value: unknown): void {
    if (!this.socket) return
    try {
      this.socket.send(JSON.stringify(value))
    } catch {
      this.closed()
    }
  }

  private publish(): void {
    try {
      const snapshot = this.engine.snapshot()
      if (snapshot && typeof snapshot === 'object' && 'current' in snapshot) {
        const call = snapshot.current
        if (
          call &&
          typeof call === 'object' &&
          'phase' in call &&
          'startedAt' in call &&
          ['connecting', 'ringing'].includes(String(call.phase)) &&
          typeof call.startedAt === 'number' &&
          Date.now() - call.startedAt > 90_000 &&
          !this.stopRequested
        ) {
          this.stopRequested = true
          this.send({
            kind: 'error',
            message: 'The call did not connect in time. Ending the attempt.',
          })
          this.track(
            this.engine.end().catch(() => {
              this.closed()
            }),
          )
        }
      }
      const encoded = JSON.stringify(snapshot)
      if (encoded !== this.previousSnapshot) {
        this.previousSnapshot = encoded
        this.send({ kind: 'snapshot', ...(snapshot as object) })
      }
    } catch {
      this.closed()
    }
  }

  private message = (event: MessageEvent): void => {
    if (!this.socket || this.closingRequested) return
    if (Date.now() - this.window >= 1000) {
      this.window = Date.now()
      this.frames = this.commands = this.videoFrames = this.videoBytes = 0
    }
    if (event.data instanceof ArrayBuffer) {
      const packet = new Uint8Array(event.data)
      if (this.videoMode && packet[0] === 2) {
        this.videoBytes += packet.byteLength
        if (
          ++this.videoFrames > 30 ||
          this.videoBytes > 4 * 1024 * 1024 ||
          packet.byteLength <= 7 ||
          packet.byteLength > 512 * 1024 + 7
        ) {
          this.closed()
          return
        }
        try {
          this.engine.video(packet)
        } catch {
          this.socket?.send(new Uint8Array([3]))
        }
        return
      }
      const pcm = this.videoMode ? packet.subarray(1) : packet
      if (
        ++this.frames > 50 ||
        pcm.byteLength !== 1920 ||
        (this.videoMode && packet[0] !== 0)
      ) {
        this.closed()
        return
      }
      try {
        this.engine.audio(pcm)
      } catch {
        /* Mic may start before setup reserves its queue. */
      }
      return
    }
    // Acknowledgements bound video queued toward a slow browser independently of audio.
    if (event.data === 'video-ack') {
      this.videoPending = Math.max(0, this.videoPending - 1)
      return
    }
    if (++this.commands > 10 || typeof event.data !== 'string') {
      this.closed()
      return
    }
    if (event.data === 'ping') {
      this.lastHeartbeat = Date.now()
      this.socket.send('pong')
      return
    }
    let input: Command
    try {
      input = command(event.data)
    } catch {
      this.closed()
      return
    }
    this.track(
      this.execute(input).catch(() => {
        this.send({
          kind: 'error',
          message: 'Voice action failed. Check call status before trying again.',
        })
      }),
    )
  }

  private async execute(input: Command): Promise<void> {
    if (input.kind === 'keyframe') {
      this.engine.keyframe()
      return
    }
    if (input.kind === 'end') {
      this.stopRequested = true
      await this.engine.end()
      this.publish()
      return
    }
    if (this.controlling) throw new Error('Voice action in progress')
    this.controlling = true
    try {
      if (input.kind === 'mute') {
        await this.engine.mute(input.muted)
        return
      }
      if (input.kind === 'reject') {
        await this.engine.reject(input.id)
        return
      }
      if (this.starting) throw new Error('Call setup in progress')
      this.starting = true
      this.stopRequested = false
      try {
        // Persist admission before signaling. Lost responses cannot trigger redials.
        const inserted = this.storage.sql
          .exec(
            'INSERT INTO voice_attempts VALUES (?, ?) ON CONFLICT(request_id) DO NOTHING RETURNING request_id',
            input.requestId,
            Date.now(),
          )
          .toArray().length
        if (!inserted) {
          this.send({
            kind: 'error',
            message:
              'This call attempt was already submitted; it will not be repeated.',
          })
          return
        }
        await this.storage.sync()
        if (this.closingRequested || this.stopRequested) return
        this.videoMode = input.video === true
        await this.engine.begin(
          input,
          packet => {
            if (!this.socket || this.closingRequested || this.stopRequested)
              throw new Error('Voice audio closed')
            if (
              !packet.byteLength ||
              packet.byteLength > (packet[0] === 2 ? 512 * 1024 + 7 : 8192)
            )
              throw new Error('Invalid call frame')
            if (packet[0] === 2) {
              if (this.videoPending >= 4) {
                this.engine.keyframe()
                return
              }
              this.videoPending++
            }
            this.socket.send(Uint8Array.from(packet))
          },
          () => this.closingRequested || this.stopRequested,
        )
        if (this.closingRequested || this.stopRequested) await this.engine.end()
      } finally {
        this.starting = false
      }
    } finally {
      this.controlling = false
      this.publish()
    }
  }
}
