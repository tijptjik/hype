import { runInDurableObject, evictDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { Mutation } from '../src/database'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

describe('Workers-native Rust', () => {
  it('executes Rust timers and cryptographic randomness in a Durable Object', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-runtime')
    expect(await account.probe()).toEqual({
      runtime: 'wasm32',
      entropy: true,
      clocks: true,
      storage: 'sqlite',
    })
    expect(
      JSON.parse(
        await account.validate(
          JSON.stringify({
            requestId: 'test-1',
            to: '+1 555 555 0100',
            text: 'synthetic',
          }),
        ),
      ),
    ).toEqual({
      requestId: 'test-1',
      to: '15555550100@s.whatsapp.net',
      text: 'synthetic',
    })
  })

  it('does not expose account operations over public HTTP', async () => {
    expect(
      (await exports.default.fetch(new Request('https://example.com/v1/status')))
        .status,
    ).toBe(404)
  })

  it('returns one bounded snapshot with account isolation and cursor validation', async () => {
    const name = 'synthetic-snapshot'
    const account = env.ACCOUNTS.getByName(name)
    await runInDurableObject(account, async instance => {
      await instance.journal.receive(
        JSON.stringify(
          Array.from({ length: 101 }, (_, i) => ({
            chat: '15555550100@s.whatsapp.net',
            sender: '15555550100@s.whatsapp.net',
            id: `synthetic-${i}`,
            timestamp: i,
            fromMe: false,
            text: 'synthetic',
            payload: JSON.stringify({ message: { conversation: 'synthetic' } }),
          })),
        ),
      )
    })
    const first = await exports.default.snapshot(name, 0)
    expect(first.messages).toHaveLength(100)
    expect(first.status.connected).toBe(false)
    expect(first.calls).toEqual({ videoSupported: true, incoming: [], current: null })
    expect(first.voiceAvailable).toBe(true)
    expect(first.outbox).toEqual([])
    expect(JSON.stringify(first)).not.toContain('payload')
    const next = await exports.default.snapshot(name, first.messages[99].sequence)
    expect(next.messages).toHaveLength(1)
    expect(
      (await exports.default.snapshot('synthetic-other-snapshot')).messages,
    ).toEqual([])
    // Assimilate RpcPromise into a native Promise before Vitest attaches
    // rejection matchers; RPC promise pipelining otherwise leaks a rejection.
    await expect(
      (async () => await exports.default.snapshot(name, -1))(),
    ).rejects.toThrow('cursor')
    await expect(
      (async () => await exports.default.snapshot('invalid/account'))(),
    ).rejects.toThrow('account')
  })

  it('preserves the Rust SDK storage contracts across the JS/SQLite boundary', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-contracts')
    await runInDurableObject(account, async instance => {
      await instance.engine.qualifyStorage(instance.database)
    })
  })

  it('gives separate accounts independent WASM instances', async () => {
    const a = env.ACCOUNTS.getByName('synthetic-a')
    const b = env.ACCOUNTS.getByName('synthetic-b')
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        expect((await a.probe()).entropy).toBe(true)
        expect((await b.probe()).entropy).toBe(true)
      }),
    )
  })

  it('constructs and shuts down the full SDK with durable protocol storage', async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('synthetic outage', { status: 503 }))
    const account = env.ACCOUNTS.getByName('synthetic-session')
    try {
      expect((await account.start()).connected).toBe(false)
      await vi.waitFor(() => expect(network).toHaveBeenCalled())
      await account.stop()
      await runInDurableObject(account, async (instance, state) => {
        expect(await state.storage.get('enabled')).toBe(false)
        expect(await state.storage.getAlarm()).toBe(null)
        expect(instance.database.read(['meta', 'device', '', ''], 100_000)).not.toBe(
          null,
        )
      })
    } finally {
      network.mockRestore()
    }
  })

  it('sends a binary Noise handshake after a real workerd WebSocket upgrade', async () => {
    const frames: ArrayBuffer[] = []
    const sockets: WebSocket[] = []
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        // Exercise workerd's actual request-option validation before mocking
        // the network. It rejects browser-only options such as redirect:error.
        const request = new Request(input, init)
        if (request.url !== 'https://web.whatsapp.com/ws/chat')
          return new Response('synthetic outage', { status: 503 })
        const pair = new WebSocketPair()
        pair[1].binaryType = 'arraybuffer'
        pair[1].accept()
        pair[1].addEventListener('message', event => {
          if (event.data instanceof ArrayBuffer) frames.push(event.data)
        })
        sockets.push(pair[1])
        return new Response(null, { status: 101, webSocket: pair[0] })
      })
    const account = env.ACCOUNTS.getByName('synthetic-websocket')
    try {
      await account.start()
      await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0))
      expect(frames[0].byteLength).toBeGreaterThan(32)
    } finally {
      await runInDurableObject(account, () => {
        for (const socket of sockets) socket.close(1000)
      })
      await account.stop()
      network.mockRestore()
    }
  })

  it('recovers interrupted sends after eviction without a fresh send claim', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-restart')
    const outbound = {
      request: {
        requestId: 'interrupted',
        to: '15555550100@s.whatsapp.net',
        text: 'synthetic',
      },
      messageId: 'SYNTHETIC',
      state: 'pending',
    }
    await runInDurableObject(account, async instance => {
      const results = await Promise.all([
        instance.journal.claim(JSON.stringify(outbound)),
        instance.journal.claim(JSON.stringify(outbound)),
      ])
      expect(results.map(r => JSON.parse(r).fresh).sort()).toEqual([false, true])
    })
    await evictDurableObject(account)
    expect((await account.result('interrupted'))?.state).toBe('uncertain')
    expect((await account.send(outbound.request)).state).toBe('uncertain')
    await runInDurableObject(account, async instance => {
      await expect(
        instance.send({ ...outbound.request, text: 'different' }),
      ).rejects.toThrow('different message')
    })
  })

  it('rolls back a whole protocol batch and bounds blob reads', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-storage')
    await runInDurableObject(account, async instance => {
      const key = ['signal', 'test', '', ''] as const
      instance.database.batch([
        { kind: 'put', key, value: new Uint8Array([1, 2]), timestamp: 1 },
      ])
      await instance.database.sync()
      expect(instance.database.read(key, 2)).toEqual(new Uint8Array([1, 2]))
      expect(() => instance.database.read(key, 1)).toThrow('bound')
      const malformed = { kind: 'not-a-real-operation' } as unknown as Mutation
      expect(() =>
        instance.database.batch([
          { kind: 'put', key, value: new Uint8Array([3]), timestamp: 2 },
          malformed,
        ]),
      ).toThrow()
      expect(instance.database.read(key, 2)).toEqual(new Uint8Array([1, 2]))
    })
  })
  it('projects old private payloads and scopes targets to their conversation', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-content')
    await runInDurableObject(account, async instance => {
      const original = {
        chat: '15555550100@s.whatsapp.net',
        sender: '15555550100@s.whatsapp.net',
        id: 'image-1',
        timestamp: 1,
        fromMe: false,
        text: null,
        payload: JSON.stringify({
          info: { push_name: 'Synthetic Person' },
          message: {
            image_message: {
              caption: 'A photo',
              url: 'https://private.invalid/token',
              media_key: [1, 2, 3],
              mimetype: 'image/jpeg',
            },
          },
        }),
      }
      await instance.journal.receive(
        JSON.stringify([
          original,
          { ...original, id: 'unknown', payload: 'invalid JSON' },
        ]),
      )
      const rows = instance.inbox()
      expect(rows[0].content.kind).toBe('image')
      expect(rows[0].content.text).toBe('A photo')
      expect(rows[0].senderName).toBe('Synthetic Person')
      expect(rows[1].content.kind).toBe('unsupported')
      expect(rows[1].sequence).toBeGreaterThan(rows[0].sequence)
      expect(JSON.stringify(rows)).not.toContain('private.invalid')
      expect(JSON.stringify(rows)).not.toContain('media_key')
      expect(
        await instance.journal.lookup(
          '15555550101@s.whatsapp.net',
          original.sender,
          original.id,
        ),
      ).toBe('null')
      expect(
        JSON.parse(
          await instance.journal.lookup(original.chat, original.sender, original.id),
        ).id,
      ).toBe(original.id)
    })
  })

  it('rejects changed quote, reaction, and attachment under an existing request ID', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-rich-retry')
    await runInDurableObject(account, async instance => {
      const request = {
        requestId: 'reply-1',
        to: '15555550100@s.whatsapp.net',
        text: 'hello',
        replyTo: { id: 'original', sender: '15555550100@s.whatsapp.net' },
      }
      await instance.journal.claim(
        JSON.stringify({ request, messageId: 'synthetic', state: 'pending' }),
      )
      for (const changed of [
        { ...request, replyTo: { ...request.replyTo, id: 'different' } },
        { ...request, replyTo: undefined },
        { ...request, attachmentId: '00000000-0000-4000-8000-000000000000' },
        { ...request, text: '', reaction: '👍' },
      ])
        await expect(instance.send(changed)).rejects.toThrow('different message')
      const reaction = { ...request, requestId: 'reaction-1', text: '', reaction: '👍' }
      await instance.journal.claim(
        JSON.stringify({
          request: reaction,
          messageId: 'synthetic-reaction',
          state: 'pending',
        }),
      )
      await expect(instance.send({ ...reaction, reaction: '' })).rejects.toThrow(
        'different message',
      )
      expect((await instance.send(reaction)).messageId).toBe('synthetic-reaction')
    })
  })

  it('stores attachment descriptors privately with account isolation and expiry', async () => {
    const a = env.ACCOUNTS.getByName('synthetic-media-a')
    const b = env.ACCOUNTS.getByName('synthetic-media-b')
    await runInDurableObject(a, async (instance, state) => {
      await instance.journal.stage('synthetic-attachment', 'private-description')
      expect(await instance.journal.attachment('synthetic-attachment')).toBe(
        'private-description',
      )
      state.storage.sql.exec('UPDATE attachments SET expires=0')
      expect(await instance.journal.attachment('synthetic-attachment')).toBe(null)
    })
    await runInDurableObject(b, async instance => {
      expect(await instance.journal.attachment('synthetic-attachment')).toBe(null)
    })
  })

  it('prefers synced contact names, resolves verified aliases, and keeps photo URLs private', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-profile')
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(new Uint8Array([255, 216, 255, 0]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
    )
    try {
      await runInDurableObject(account, async instance => {
        const pn = '15555550100@s.whatsapp.net',
          lid = '123456789012@lid'
        instance.profiles.contacts(
          JSON.stringify([
            {
              jid: pn,
              aliases: [pn, lid],
              name: 'Saved Contact',
              username: 'saved.handle',
              timestamp: 2,
            },
          ]),
        )
        const profile = await instance.profiles.save({
          jid: lid,
          aliases: [pn, lid],
          name: 'Display Name',
          username: 'actual.handle',
          phone: '+15555550100',
          photoUrl: 'https://pps.whatsapp.net/synthetic-signed-photo',
        })
        expect(profile.name).toBe('Saved Contact')
        expect(profile.username).toBe('actual.handle')
        expect(profile.photo).toBe('data:image/jpeg;base64,/9j/AA==')
        expect(JSON.stringify(profile)).not.toContain('signed-photo')
        expect(instance.profiles.cached(lid)?.name).toBe('Saved Contact')
        instance.profiles.contacts(
          JSON.stringify([
            {
              jid: pn,
              aliases: [pn, lid],
              name: 'Old Contact',
              username: null,
              timestamp: 1,
            },
          ]),
        )
        expect(
          (
            await instance.profiles.save({
              jid: lid,
              aliases: [pn, lid],
              name: null,
              username: null,
              phone: null,
              photoUrl: null,
            })
          ).name,
        ).toBe('Saved Contact')
        instance.profiles.contacts(
          JSON.stringify([
            { jid: pn, aliases: [pn], name: null, username: null, timestamp: 3 },
          ]),
        )
        expect(instance.profiles.cached(lid)).toBe(null)
        expect(
          (
            await instance.profiles.save({
              jid: lid,
              aliases: [pn, lid],
              name: 'Display Name',
              username: null,
              phone: null,
              photoUrl: null,
            })
          ).name,
        ).toBe('Display Name')
      })
    } finally {
      network.mockRestore()
    }
  })

  it('rejects unsafe profile photo locations and oversized thumbnails', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-profile-limits')
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Uint8Array(128 * 1024 + 1)))
    try {
      await runInDurableObject(account, async instance => {
        const base = {
          jid: '15555550100@s.whatsapp.net',
          aliases: ['15555550100@s.whatsapp.net'],
          name: null,
          username: null,
          phone: null,
        }
        expect(
          (
            await instance.profiles.save({
              ...base,
              photoUrl: 'https://not-whatsapp.invalid/picture',
            })
          ).photo,
        ).toBe(null)
        expect(network).not.toHaveBeenCalled()
        expect(
          (
            await instance.profiles.save({
              ...base,
              photoUrl: 'https://pps.whatsapp.net/too-large',
            })
          ).photo,
        ).toBe(null)
      })
    } finally {
      network.mockRestore()
    }
  })
})
