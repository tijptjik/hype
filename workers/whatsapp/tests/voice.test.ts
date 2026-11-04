import { runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { VoiceConnection, VoiceTickets, type VoiceEngine } from '../src/voice'
import gateway from '../../whatsapp-calls/src/index'

function fakeEngine(): VoiceEngine {
  return {
    snapshot: vi.fn(() => ({ incoming: [], current: null })),
    begin: vi.fn(async () => {}),
    audio: vi.fn(),
    video: vi.fn(),
    keyframe: vi.fn(),
    mute: vi.fn(async () => {}),
    reject: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
  }
}

function connect(connection: VoiceConnection) {
  const response = connection.open()
  expect(response.status).toBe(101)
  expect(response.headers.get('sec-websocket-protocol')).toBe('whatsover.v1')
  const socket = response.webSocket!
  socket.binaryType = 'arraybuffer'
  socket.accept()
  const events: unknown[] = []
  socket.addEventListener('message', event => {
    events.push(event.data)
  })
  return { socket, events }
}

describe('account voice channel', () => {
  it('validates private decline requests without starting a session or microphone', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-voice-decline')
    await runInDurableObject(account, async instance => {
      await expect(instance.rejectCall('invalid/id')).rejects.toThrow('Invalid call ID')
      await expect(instance.rejectCall('incoming-call')).rejects.toThrow(
        'not connected',
      )
    })
    expect((await account.status()).connected).toBe(false)
  })
  it('binds single-use hashed tickets to account, expiry and exact browser origin', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-voice-tickets')
    await runInDurableObject(account, async (_, state) => {
      const tickets = new VoiceTickets(state.storage)
      await expect(tickets.issue('http://example.com')).rejects.toThrow('origin')
      await expect(tickets.issue('https://example.com/path')).rejects.toThrow('origin')
      const ticket = await tickets.issue('http://127.0.0.1:4179')
      expect(
        state.storage.sql
          .exec<{ digest: string }>('SELECT digest FROM voice_tickets')
          .one().digest,
      ).not.toBe(ticket.token)
      expect(await tickets.consume(ticket.token, 'http://127.0.0.1:4173')).toBe(false)
      const outcomes = await Promise.all([
        tickets.consume(ticket.token, 'http://127.0.0.1:4179'),
        tickets.consume(ticket.token, 'http://127.0.0.1:4179'),
      ])
      expect(outcomes.sort()).toEqual([false, true])
      const expired = await tickets.issue('https://example.com')
      state.storage.sql.exec('UPDATE voice_tickets SET expires=0')
      expect(await tickets.consume(expired.token, 'https://example.com')).toBe(false)
    })
  })

  it('forwards PCM both ways and hangs up on browser disconnect', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-audio'),
      async (_, state) => {
        const engine = fakeEngine()
        let output!: (frame: Uint8Array) => void
        vi.mocked(engine.begin).mockImplementation(async (_input, sink) => {
          output = sink
        })
        const channel = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const { socket, events } = connect(channel)
        try {
          expect(channel.open().status).toBe(409)
          socket.send(
            JSON.stringify({
              kind: 'outgoing',
              requestId: 'audio-call',
              to: '+15555550100',
            }),
          )
          await vi.waitFor(() => expect(engine.begin).toHaveBeenCalledOnce())
          socket.send(new Uint8Array(1920))
          await vi.waitFor(() => expect(engine.audio).toHaveBeenCalledOnce())
          output(new Uint8Array([0, 1, 2]))
          await vi.waitFor(() =>
            expect(events.some(event => event instanceof ArrayBuffer)).toBe(true),
          )
          socket.send(JSON.stringify({ kind: 'mute', muted: true }))
          await vi.waitFor(() => expect(engine.mute).toHaveBeenCalledWith(true))
          socket.close()
          await vi.waitFor(() => expect(engine.end).toHaveBeenCalled())
        } finally {
          await channel.close()
          socket.close()
        }
      },
    )
  })

  it('does not redial a persisted request after reconnecting the voice transport', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-retry'),
      async (_, state) => {
        const engine = fakeEngine()
        const first = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const peer = connect(first).socket
        const request = JSON.stringify({
          kind: 'outgoing',
          requestId: 'same-attempt',
          to: '+15555550100',
        })
        peer.send(request)
        await vi.waitFor(() => expect(engine.begin).toHaveBeenCalledOnce())
        await first.close()
        peer.close()
        const second = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const { socket, events } = connect(second)
        try {
          socket.send(request)
          await vi.waitFor(() =>
            expect(
              events.some(
                event =>
                  typeof event === 'string' && event.includes('already submitted'),
              ),
            ).toBe(true),
          )
          expect(engine.begin).toHaveBeenCalledOnce()
        } finally {
          await second.close()
          socket.close()
        }
      },
    )
  })

  it('holds the account slot and cancels pending setup when its browser disappears', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-pending'),
      async (_, state) => {
        const engine = fakeEngine()
        let finish!: () => void
        const gate = new Promise<void>(resolve => {
          finish = resolve
        })
        let cancelled!: () => boolean
        vi.mocked(engine.begin).mockImplementation(
          async (_input, _output, isCancelled) => {
            cancelled = isCancelled
            await gate
          },
        )
        const channel = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const { socket } = connect(channel)
        socket.send(
          JSON.stringify({
            kind: 'answer',
            requestId: 'pending-call',
            id: 'incoming-call',
          }),
        )
        await vi.waitFor(() => expect(engine.begin).toHaveBeenCalledOnce())
        const closing = channel.close()
        expect(cancelled()).toBe(true)
        expect(channel.open().status).toBe(409)
        finish()
        await closing
        socket.close()
        expect(engine.end).toHaveBeenCalled()
        const next = connect(channel).socket
        await channel.close()
        next.close()
      },
    )
  })

  it('hang-up can interrupt setup without waiting for the serialized begin action', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-interrupt'),
      async (_, state) => {
        const engine = fakeEngine()
        let finish!: () => void
        let cancelled!: () => boolean
        vi.mocked(engine.begin).mockImplementation(
          async (_input, _sink, isCancelled) => {
            cancelled = isCancelled
            await new Promise<void>(resolve => {
              finish = resolve
            })
          },
        )
        const channel = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const { socket } = connect(channel)
        try {
          socket.send(
            JSON.stringify({
              kind: 'outgoing',
              requestId: 'interrupt-call',
              to: '+15555550100',
            }),
          )
          await vi.waitFor(() => expect(engine.begin).toHaveBeenCalledOnce())
          socket.send('{"kind":"end"}')
          await vi.waitFor(() => expect(engine.end).toHaveBeenCalled())
          expect(cancelled()).toBe(true)
        } finally {
          finish()
          await channel.close()
          socket.close()
        }
      },
    )
  })

  it('closes malformed and excessive audio instead of handing it to WASM', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-bounds'),
      async (_, state) => {
        for (const packet of [
          new Uint8Array(8192),
          JSON.stringify({ kind: 'end', account: 'someone-else' }),
        ]) {
          const engine = fakeEngine()
          const channel = new VoiceConnection(state.storage, engine, task =>
            state.waitUntil(task),
          )
          const { socket } = connect(channel)
          try {
            socket.send(packet)
            await vi.waitFor(() => expect(engine.end).toHaveBeenCalled())
            expect(engine.audio).not.toHaveBeenCalled()
            expect(engine.begin).not.toHaveBeenCalled()
          } finally {
            await channel.close()
            socket.close()
          }
        }
      },
    )
  })

  it('rejects unauthenticated upgrades and leaves ordinary RPC unavailable on HTTP', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-voice-auth')
    const headers = {
      Upgrade: 'websocket',
      Origin: 'https://example.com',
      'Sec-WebSocket-Protocol': `whatsover.v1, token.${'a'.repeat(64)}`,
    }
    expect(
      (await account.fetch(new Request('https://voice.internal/voice', { headers })))
        .status,
    ).toBe(401)
    expect(
      (
        await exports.default.fetch(
          new Request('https://example.com/voice', { headers }),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await exports.VoiceGateway.fetch(
          new Request(`https://voice.internal/voice/${account.id}`, { headers }),
        )
      ).status,
    ).toBe(401)
    const ticket = await runInDurableObject(account, instance =>
      instance.voiceTickets.issue('https://example.com'),
    )
    const validHeaders = {
      ...headers,
      'Sec-WebSocket-Protocol': `whatsover.v1, token.${ticket.token}`,
    }
    const other = env.ACCOUNTS.getByName('synthetic-voice-other-account')
    expect(
      (
        await exports.VoiceGateway.fetch(
          new Request(`https://voice.internal/voice/${other.id}`, {
            headers: validHeaders,
          }),
        )
      ).status,
    ).toBe(401)
    // A valid capability reaches only its own unconnected synthetic account.
    expect(
      (
        await exports.VoiceGateway.fetch(
          new Request(`https://voice.internal/voice/${account.id}`, {
            headers: validHeaders,
          }),
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await exports.VoiceGateway.fetch(
          new Request(`https://voice.internal/voice/${account.id}`, {
            headers: validHeaders,
          }),
        )
      ).status,
    ).toBe(401)
  })

  it('forwards only voice upgrade headers and never cookies, bearer headers or URL tokens', async () => {
    const fetcher = vi.fn(
      async (_request: Request) =>
        new Response('Synthetic unauthorized', { status: 401 }),
    )
    const binding = { VOICE: { fetch: fetcher } } as unknown as Parameters<
      typeof gateway.fetch
    >[1]
    const path = `/voice/${'a'.repeat(64)}`
    const headers = {
      Upgrade: 'websocket',
      Origin: 'https://example.com',
      'Sec-WebSocket-Protocol': `whatsover.v1, token.${'b'.repeat(64)}`,
      Cookie: 'synthetic-cookie',
      Authorization: 'Bearer synthetic',
    }
    expect(
      (
        await gateway.fetch(
          new Request(`https://gateway.example${path}`, { headers }),
          binding,
        )
      ).status,
    ).toBe(401)
    const forwarded = fetcher.mock.calls[0][0]
    expect(forwarded.headers.get('cookie')).toBeNull()
    expect(forwarded.headers.get('authorization')).toBeNull()
    expect(forwarded.headers.get('origin')).toBe('https://example.com')
    expect(forwarded.url).toBe(`https://voice.internal${path}`)
    expect(
      (
        await gateway.fetch(
          new Request(`https://gateway.example${path}?token=synthetic`, { headers }),
          binding,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await gateway.fetch(
          new Request(`https://gateway.example${path}`, {
            headers: { ...headers, 'Sec-WebSocket-Protocol': 'whatsover.v1' },
          }),
          binding,
        )
      ).status,
    ).toBe(401)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('ends an abandoned voice connection after its heartbeat expires', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-voice-heartbeat'),
      async (_, state) => {
        const engine = fakeEngine()
        const channel = new VoiceConnection(state.storage, engine, task =>
          state.waitUntil(task),
        )
        const { socket } = connect(channel)
        const now = Date.now()
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 26_000)
        try {
          await vi.waitFor(() => expect(engine.end).toHaveBeenCalled(), {
            timeout: 2000,
          })
        } finally {
          clock.mockRestore()
          await channel.close()
          socket.close()
        }
      },
    )
  })
})

it('keeps video and PCM separate, bounds unacknowledged output, and requests keyframe recovery', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-video-frames'),
    async (_, state) => {
      const engine = fakeEngine()
      let output!: (frame: Uint8Array) => void
      vi.mocked(engine.begin).mockImplementation(async (_input, sink) => {
        output = sink
      })
      const channel = new VoiceConnection(state.storage, engine, task =>
        state.waitUntil(task),
      )
      const { socket, events } = connect(channel)
      try {
        socket.send(
          JSON.stringify({
            kind: 'outgoing',
            requestId: 'video-call',
            to: '+15555550100',
            video: true,
          }),
        )
        await vi.waitFor(() =>
          expect(engine.begin).toHaveBeenCalledWith(
            expect.objectContaining({ video: true }),
            expect.any(Function),
            expect.any(Function),
          ),
        )
        const frame = new Uint8Array([2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0x65])
        socket.send(frame)
        await vi.waitFor(() => expect(engine.video).toHaveBeenCalledOnce())
        socket.send(new Uint8Array(1921))
        await vi.waitFor(() => expect(engine.audio).toHaveBeenCalledOnce())
        expect(vi.mocked(engine.audio).mock.calls[0][0].byteLength).toBe(1920)
        for (let i = 0; i < 6; i++) output(frame)
        await vi.waitFor(() =>
          expect(events.filter(value => value instanceof ArrayBuffer)).toHaveLength(4),
        )
        expect(engine.keyframe).toHaveBeenCalled()
        socket.send('video-ack')
        await new Promise(resolve => setTimeout(resolve, 20))
        output(frame)
        await vi.waitFor(() =>
          expect(events.filter(value => value instanceof ArrayBuffer)).toHaveLength(5),
        )
        socket.send(new Uint8Array(512 * 1024 + 8).fill(2))
        await vi.waitFor(() => expect(engine.end).toHaveBeenCalled())
      } finally {
        await channel.close()
        socket.close()
      }
    },
  )
})
