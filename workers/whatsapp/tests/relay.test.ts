import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { RelayHost } from '../src/relay'
import { proxyRelay } from '../../whatsapp-relay/src/socket-proxy'

describe('private voice relay host', () => {
  it('isolates late call cleanup and validates incoming offer ownership in real WASM', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-lifecycle'),
      async instance => {
        instance.engine.qualifyCallLifecycle()
      },
    )
  })
  it('keeps both proxy sockets active during traffic and closes the native side with the caller', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-relay-proxy'),
      async () => {
        const native = new WebSocketPair()
        native[1].binaryType = 'arraybuffer'
        native[1].accept()
        let nativeClosed = false
        native[1].addEventListener('close', () => {
          nativeClosed = true
        })
        native[1].addEventListener('message', event => native[1].send(event.data))
        const response = proxyRelay(native[0])
        const client = response.webSocket!
        client.binaryType = 'arraybuffer'
        client.accept()
        const received: unknown[] = []
        client.addEventListener('message', event => received.push(event.data))
        client.send(new Uint8Array([7, 8]))
        await vi.waitFor(() => expect(received).toHaveLength(1))
        expect(new Uint8Array(received[0] as ArrayBuffer)).toEqual(
          new Uint8Array([7, 8]),
        )
        client.close()
        await vi.waitFor(() => expect(nativeClosed).toBe(true))
        native[1].close()
      },
    )
  })

  it('passes packets through the actual Rust WASM relay trait', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-rust-relay'),
      async instance => {
        let peer!: WebSocket
        const frames: string[] = []
        const host = new RelayHost(async () => {
          const pair = new WebSocketPair()
          peer = pair[1]
          peer.binaryType = 'arraybuffer'
          peer.accept()
          peer.addEventListener('message', event => {
            frames.push(typeof event.data === 'string' ? 'text' : 'binary')
            if (typeof event.data === 'string') peer.send('{"state":"connected"}')
            else peer.send(event.data)
          })
          return new Response(null, { status: 101, webSocket: pair[0] })
        }, 'synthetic-account')
        try {
          await instance.engine.qualifyRelay(host)
        } catch (error) {
          throw new Error(
            `${String(error)}; synthetic frame kinds: ${frames.join(',')}`,
          )
        } finally {
          peer?.close()
        }
      },
    )
  })

  it('waits for native readiness, forwards packets, and detaches callbacks on close', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-relay-host'),
      async () => {
        const events: unknown[] = []
        const packets: unknown[] = []
        let peer!: WebSocket
        const host = new RelayHost(async request => {
          expect(new URL(request.url).pathname).toBe('/synthetic-account')
          expect(request.headers.get('authorization')).toBeNull()
          const pair = new WebSocketPair()
          peer = pair[1]
          peer.accept()
          peer.addEventListener('message', event => {
            if (typeof event.data === 'string' && event.data.includes('endpoint')) {
              expect(JSON.parse(event.data)).toEqual({ endpoint: '157.240.1.1:3478' })
              peer.send('{"state":"connected"}')
            } else packets.push(event.data)
          })
          return new Response(null, { status: 101, webSocket: pair[0] })
        }, 'synthetic-account')
        const socket = host.dial('157.240.1.1:3478', event => events.push(event))
        try {
          expect(() => socket.send(new Uint8Array([1]))).toThrow('closed')
          await socket.ready
          expect(events).toEqual(['connected'])
          peer.send(new Uint8Array([1, 2, 3]))
          peer.send('{"dropped":2}')
          await vi.waitFor(() => expect(events.length).toBe(3))
          expect(new Uint8Array(events[1] as ArrayBuffer)).toEqual(
            new Uint8Array([1, 2, 3]),
          )
          expect(events[2]).toBe(2)
          socket.send(new Uint8Array([4, 5]))
          await vi.waitFor(() => expect(packets).toHaveLength(1))
          expect(() => socket.send(new Uint8Array(65_537))).toThrow('size')
        } finally {
          socket.close()
          peer.close()
        }
        expect(() => socket.send(new Uint8Array([1]))).toThrow('closed')
        expect(events).toHaveLength(3)
      },
    )
  })

  it('reports a sanitized connection failure and rejects non-endpoint input before I/O', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-relay-failure'),
      async () => {
        const fetcher = vi.fn(
          async () => new Response('private failure data', { status: 503 }),
        )
        const notifications: unknown[] = []
        const host = new RelayHost(fetcher, 'synthetic-account')
        expect(() => host.dial('https://host/path?token=secret', () => {})).toThrow(
          'endpoint',
        )
        expect(fetcher).not.toHaveBeenCalled()
        const socket = host.dial('157.240.1.1:3478', event => notifications.push(event))
        await expect(socket.ready).rejects.toThrow('Voice relay unavailable')
        expect(notifications).toEqual([null])
        socket.close()
      },
    )
  })

  it('terminates malformed relay data instead of passing it to WASM', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-relay-malformed'),
      async () => {
        let peer!: WebSocket
        const notifications: unknown[] = []
        const host = new RelayHost(async () => {
          const pair = new WebSocketPair()
          peer = pair[1]
          peer.accept()
          peer.addEventListener('message', () => peer.send('{"state":"connected"}'), {
            once: true,
          })
          return new Response(null, { status: 101, webSocket: pair[0] })
        }, 'synthetic-account')
        const socket = host.dial('157.240.1.1:3478', event => notifications.push(event))
        try {
          await socket.ready
          peer.send('{"dropped":-1}')
          await vi.waitFor(() => expect(notifications).toEqual(['connected', null]))
          expect(() => socket.send(new Uint8Array([1]))).toThrow('closed')
        } finally {
          socket.close()
          peer.close()
        }
      },
    )
  })
})
