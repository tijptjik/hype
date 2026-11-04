/** Account-owned host boundary for the Rust relay transport. No public URLs or tokens. */
export interface RelaySocket {
  ready: Promise<void>
  send(data: Uint8Array): void
  close(): void
}

type Notification = ArrayBuffer | 'connected' | number | null
type PrivateFetch = (request: Request) => Promise<Response>

/** Each instance is scoped to one Durable Object and its private service binding. */
export class RelayHost {
  constructor(
    private readonly fetchRelay: PrivateFetch,
    private readonly account: string,
  ) {}

  /** Dial only an SDK-supplied relay; credentials are injected inside the relay service. */
  dial(endpoint: string, callback: (event: Notification) => void): RelaySocket {
    if (endpoint.length > 128 || !/^[\da-fA-F:.[\]]+$/.test(endpoint))
      throw new Error('Invalid relay endpoint')
    let socket: WebSocket | undefined
    let notify: typeof callback | undefined = callback
    let closed = false
    let connected = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let handshake: ReturnType<typeof setTimeout> | undefined
    let lastReply = Date.now()
    let resolve!: () => void
    let reject!: (error: Error) => void
    const abort = new AbortController()
    const ready = new Promise<void>((yes, no) => {
      resolve = yes
      reject = no
    })
    // Rust immediately awaits ready, but a synchronous caller can close first.
    void ready.catch(() => {})

    const close = () => {
      if (closed) return
      closed = true
      notify = undefined
      abort.abort()
      clearInterval(heartbeat)
      clearTimeout(handshake)
      if (socket) {
        socket.removeEventListener('message', message)
        socket.removeEventListener('error', ended)
        socket.removeEventListener('close', ended)
        try {
          socket.close(1000, 'relay closed')
        } catch {
          /* Already ended. */
        }
      }
      reject(new Error('Voice relay unavailable'))
    }
    const ended = () => {
      const previous = notify
      close()
      previous?.(null)
    }
    const message = (event: MessageEvent) => {
      if (closed) return
      if (event.data instanceof ArrayBuffer) {
        if (!connected || !event.data.byteLength || event.data.byteLength > 65_536) {
          ended()
          return
        }
        lastReply = Date.now()
        notify?.(event.data)
        return
      }
      if (typeof event.data !== 'string' || event.data.length > 128) {
        ended()
        return
      }
      if (event.data === 'pong') {
        lastReply = Date.now()
        return
      }
      try {
        const value: unknown = JSON.parse(event.data)
        if (typeof value !== 'object' || !value) {
          ended()
          return
        }
        if ('state' in value && value.state === 'connected' && !connected) {
          connected = true
          lastReply = Date.now()
          clearTimeout(handshake)
          notify?.('connected')
          resolve()
        } else if (
          'dropped' in value &&
          Number.isSafeInteger(value.dropped) &&
          Number(value.dropped) > 0 &&
          Number(value.dropped) <= 0xffffffff
        ) {
          notify?.(Number(value.dropped))
        } else ended()
      } catch {
        ended()
      }
    }
    handshake = setTimeout(ended, 35_000)
    void (async () => {
      try {
        const response = await this.fetchRelay(
          new Request(`https://relay.internal/${this.account}`, {
            headers: { Upgrade: 'websocket' },
            signal: abort.signal,
          }),
        )
        if (response.status !== 101 || !response.webSocket) {
          await response.body?.cancel()
          ended()
          return
        }
        socket = response.webSocket
        if (closed) {
          try {
            socket.close(1000)
          } catch {}
          return
        }
        socket.binaryType = 'arraybuffer'
        socket.addEventListener('message', message)
        socket.addEventListener('close', ended)
        socket.addEventListener('error', ended)
        socket.accept()
        socket.send(JSON.stringify({ endpoint }))
        heartbeat = setInterval(() => {
          if (Date.now() - lastReply > 25_000) {
            ended()
            return
          }
          try {
            socket?.send('ping')
          } catch {
            ended()
          }
        }, 10_000)
      } catch {
        ended()
      }
    })()
    return {
      ready,
      send(data: Uint8Array) {
        if (!connected || closed || !socket) throw new Error('Voice relay is closed')
        if (!data.byteLength || data.byteLength > 65_536)
          throw new Error('Invalid relay packet size')
        socket.send(data)
      },
      close,
    }
  }
}
