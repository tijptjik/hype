import { runInDurableObject, evictDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { WebCryptoProvider } from '@mtcute/web'
import cryptoWasm from '@mtcute/wasm/mtcute.wasm'
import { createTelegramStorage } from '../src/storage'
import { workersPlatform } from '../src/platform'
import { TelegramClient } from '@mtcute/core/client.js'
import { WorkersTelegramTransport } from '../src/transport'
import { LogManager } from '@mtcute/core/utils.js'
import type { Dialog, Message } from '@mtcute/core'
import { loadDialogPage, loadHistoryPage } from '../src/history'
import { sessionMiddlewares } from '../src/lifecycle'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

describe('Telegram Workers runtime', () => {
  it('cancels a stalled SDK request at its deadline and retains caller cancellation', async () => {
    const lifetime = new AbortController()
    const caller = new AbortController()
    const bounded = sessionMiddlewares(lifetime.signal, 10)[0]
    const context = {
      request: { _: 'help.getConfig' },
      params: { abortSignal: caller.signal },
    } as Parameters<typeof bounded>[0]
    const pending = (ctx: typeof context) =>
      new Promise<never>((_, reject) => {
        const signal = ctx.params!.abortSignal!
        if (signal.aborted) reject(signal.reason)
        else
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    await expect(bounded(context, pending)).rejects.toThrow('timed out')
    const cancelled = bounded(context, pending)
    caller.abort(new Error('Caller cancelled'))
    await expect(cancelled).rejects.toThrow('Caller cancelled')
  })

  it.each(['stop', 'alarm'] as const)(
    '%s interrupts a stalled phone login before disposing the SDK',
    async action => {
      const sockets: WebSocket[] = []
      const stub = env.ACCOUNTS.getByName(`synthetic-cancel-${action}`)
      const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        const pair = new WebSocketPair()
        pair[1].accept()
        sockets.push(pair[1])
        return new Response(null, { status: 101, webSocket: pair[0] })
      })
      try {
        await runInDurableObject(stub, async (instance, state) => {
          await instance.watch('operator:tab')
          let settled = false
          const login = instance.login({ kind: 'phone', phone: '+15555550100' }).then(
            () => {
              settled = true
              return null
            },
            error => {
              settled = true
              return error
            },
          )
          await vi.waitFor(() => expect(network).toHaveBeenCalled())
          expect(settled).toBe(false)
          const access = instance as unknown as { client: TelegramClient | undefined }
          const client = access.client!
          const destroy = client.destroy.bind(client)
          const disposal = vi.spyOn(client, 'destroy').mockImplementation(async () => {
            expect(settled).toBe(true)
            await destroy()
          })
          if (action === 'alarm')
            state.storage.sql.exec('UPDATE bridge_viewers SET expires=0')
          await instance[action]()
          expect(await login).toBeInstanceOf(Error)
          expect(disposal).toHaveBeenCalledOnce()
          expect(instance.status().connected).toBe(false)
          expect(access.client).toBeUndefined()
          expect(await state.storage.get('enabled')).toBe(action === 'alarm')
        })
      } finally {
        await runInDurableObject(stub, () => {
          for (const socket of sockets) socket.close(1000)
        })
        network.mockRestore()
      }
    },
  )

  it('does not expose private account RPC over HTTP', async () => {
    expect(
      (await exports.default.fetch(new Request('https://example.com/private'))).status,
    ).toBe(404)
  })

  it('runs MTProto crypto using a statically bundled WASM module', async () => {
    const provider = new WebCryptoProvider({ wasmInput: cryptoWasm })
    await provider.initialize()
    expect(
      Buffer.from(
        await provider.sha256(new TextEncoder().encode('synthetic')),
      ).toString('hex'),
    ).toBe('b3cc0475bb78a5026098858e9889acf666d31062d513d303314eca31d36e72f2')
    const key = crypto.getRandomValues(new Uint8Array(32))
    const iv = crypto.getRandomValues(new Uint8Array(32))
    const plain = crypto.getRandomValues(new Uint8Array(32))
    const cipher = provider.createAesIge(key, iv)
    expect(await cipher.decrypt(await cipher.encrypt(plain))).toEqual(plain)
  })

  it('persists actual SDK auth repositories across eviction and isolates accounts', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-storage')
    const key = new Uint8Array(256).fill(17)
    await runInDurableObject(stub, async (_instance, state) => {
      const storage = createTelegramStorage(state.storage)
      storage.driver.setup(new LogManager('test', workersPlatform), workersPlatform)
      await storage.driver.load()
      await storage.authKeys.set(2, key)
      expect(await storage.authKeys.get(2)).toEqual(key)
      await storage.driver.save()
    })
    await evictDurableObject(stub)
    await runInDurableObject(stub, async (_instance, state) => {
      const storage = createTelegramStorage(state.storage)
      storage.driver.setup(new LogManager('test', workersPlatform), workersPlatform)
      await storage.driver.load()
      expect(await storage.authKeys.get(2)).toEqual(key)
    })
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-storage-other'),
      async (_instance, state) => {
        const storage = createTelegramStorage(state.storage)
        storage.driver.setup(new LogManager('test', workersPlatform), workersPlatform)
        await storage.driver.load()
        expect(await storage.authKeys.get(2)).toBeNull()
      },
    )
  })

  it('replays bounded messages and changed versions without duplicating unchanged updates', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-inbox')
    await runInDurableObject(stub, instance => {
      for (let i = 1; i <= 101; i++)
        instance.journal.record({
          id: String(i),
          chat: '123',
          sender: '123',
          timestamp: i,
          fromMe: false,
          text: 'synthetic',
        })
      instance.journal.record({
        id: '1',
        chat: '123',
        sender: '123',
        timestamp: 1,
        fromMe: false,
        text: 'synthetic',
      })
    })
    const first = await stub.snapshot()
    expect(first.messages).toHaveLength(100)
    expect((await stub.snapshot(100)).messages).toHaveLength(1)
    expect(
      (await env.ACCOUNTS.getByName('synthetic-isolated').snapshot()).messages,
    ).toEqual([])
    await expect((async () => await stub.snapshot(-1))()).rejects.toThrow('cursor')
  })

  it('preserves uncertain sends across restart and rejects changed request reuse', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-outbox')
    const request = { requestId: 'same', to: '123', text: 'synthetic' }
    await runInDurableObject(stub, async instance => {
      await instance.journal.begin(request, '1234567')
    })
    await evictDurableObject(stub)
    expect((await stub.send(request)).state).toBe('uncertain')
    await expect(
      (async () => await stub.send({ ...request, text: 'different' }))(),
    ).rejects.toThrow('different send')
  })

  it('opening an unregistered account does not initiate login or contact Telegram', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-presence')
    expect((await stub.watch('operator-a:tab1')).connected).toBe(false)
    await stub.watch('operator-b:tab1')
    await stub.unwatch('operator-a:tab1')
    await runInDurableObject(stub, (instance, state) => {
      expect(instance.presence.nextExpiry(Date.now())).not.toBeNull()
      expect(
        state.storage.sql.exec('SELECT * FROM bridge_viewers').toArray(),
      ).toHaveLength(2)
    })
  })
})

describe('Telegram update journal', () => {
  it('discovers older and archived conversations without returning peer access hashes', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-dialog-pages'),
      async instance => {
        const dialog = (id: number) =>
          ({
            peer: {
              id,
              inputPeer: {
                _: 'inputPeerUser',
                userId: id,
                accessHash: 'private-synthetic-hash',
              },
            },
            raw: { topMessage: id },
            lastMessage: {
              id,
              chat: { id },
              sender: { id, displayName: 'Synthetic' },
              date: new Date((1000 - id) * 1000),
              text: 'synthetic',
              isOutgoing: false,
            },
          }) as unknown as Dialog
        let rows = Array.from({ length: 30 }, (_, i) => dialog(i + 1))
        const iterDialogs = vi.fn().mockImplementation(async function* () {
          yield* rows
        })
        const resolvePeer = vi.fn().mockResolvedValue({
          _: 'inputPeerUser',
          userId: 30,
          accessHash: 'private-synthetic-hash',
        })
        const client = { iterDialogs, resolvePeer } as unknown as Pick<
          TelegramClient,
          'iterDialogs' | 'resolvePeer'
        >
        const first = await loadDialogPage(client, instance.journal)
        expect(first.next).toEqual({ peer: '30', id: 30, date: 970000 })
        expect(first.messages).toHaveLength(30)
        expect(JSON.stringify(first)).not.toContain('private-synthetic-hash')
        expect(iterDialogs).toHaveBeenLastCalledWith({
          archived: 'keep',
          limit: 30,
          chunkSize: 30,
        })
        rows = [dialog(31)]
        const second = await loadDialogPage(client, instance.journal, first.next!)
        expect(second.next).toBeNull()
        expect(second.messages[0].chat).toBe('31')
        expect(resolvePeer).toHaveBeenCalledWith(30)
        expect(iterDialogs).toHaveBeenLastCalledWith(
          expect.objectContaining({
            offsetId: 30,
            offsetDate: 970000,
            pinned: 'exclude',
            archived: 'keep',
          }),
        )
        await expect(
          loadDialogPage(client, instance.journal, { peer: '0', id: 1, date: 0 }),
        ).rejects.toThrow('cursor')
      },
    )
  })

  it('paginates native history independently of journal order and preserves edits/deletions', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-history'),
      async instance => {
        const message = (id: number) =>
          ({
            id,
            chat: { id: 42 },
            sender: { id: 42, displayName: 'Synthetic' },
            date: new Date(id * 1000),
            text: 'original',
            isOutgoing: false,
          }) as Message
        instance.journal.record({
          ...(await import('../src/projection')).projectMessage(message(31)),
          text: 'edited',
          editedAt: 50000,
        })
        instance.journal.deleteMessages([30], null)
        const getHistory = vi.fn().mockResolvedValue([message(31), message(30)])
        const client = { getHistory } as unknown as Pick<TelegramClient, 'getHistory'>
        const first = await loadHistoryPage(client, instance.journal, 42)
        expect(first.nextBefore).toBe('30')
        expect(first.messages).toHaveLength(1)
        expect(first.messages[0].text).toBe('edited')
        getHistory.mockResolvedValue([message(29)])
        const next = await loadHistoryPage(
          client,
          instance.journal,
          42,
          first.nextBefore!,
        )
        expect(getHistory).toHaveBeenLastCalledWith(42, {
          limit: 30,
          offset: { id: 30, date: 0 },
        })
        expect(next.nextBefore).toBe('29')
        expect(next.messages[0].id).toBe('29')
        getHistory.mockResolvedValue([])
        expect(
          (await loadHistoryPage(client, instance.journal, 42, '29')).nextBefore,
        ).toBeNull()
        await expect(
          loadHistoryPage(client, instance.journal, 42, '0'),
        ).rejects.toThrow('cursor')
        await expect(
          loadHistoryPage(client, instance.journal, 42, '2147483648'),
        ).rejects.toThrow('cursor')
        getHistory.mockResolvedValue([message(29)])
        await expect(
          loadHistoryPage(client, instance.journal, 42, '29'),
        ).rejects.toThrow('advance')
      },
    )
  })

  it('keeps deletions scoped and prevents history from resurrecting unknown deleted messages', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-deletions')
    await runInDurableObject(stub, async instance => {
      const base = {
        id: '1',
        sender: '42',
        timestamp: 1000,
        fromMe: false,
        text: 'original',
      }
      instance.journal.record({ ...base, chat: '42' })
      instance.journal.record({ ...base, chat: '-1000000000042' })
      instance.journal.deleteMessages([1, 2], null)
      expect(instance.journal.message('42', '1')?.deleted).toBe(true)
      expect(instance.journal.message('-1000000000042', '1')?.deleted).toBeUndefined()
      instance.journal.record({ ...base, chat: '42' }, 'history')
      instance.journal.record({ ...base, id: '2', chat: '42' }, 'history')
      expect(instance.journal.message('42', '1')?.text).toBeNull()
      expect(instance.journal.message('42', '2')).toBeNull()
      instance.journal.deleteMessages([1], '-1000000000042')
      expect(instance.journal.message('-1000000000042', '1')?.deleted).toBe(true)
    })
  })

  it('preserves edits and reaction updates when an older history request finishes later', async () => {
    const stub = env.ACCOUNTS.getByName('synthetic-edits')
    await runInDurableObject(stub, async instance => {
      const base = {
        id: '1',
        chat: '42',
        sender: '42',
        timestamp: 1000,
        fromMe: false,
        text: 'original',
        editedAt: 0,
      }
      instance.journal.record(base)
      instance.journal.record({ ...base, text: 'edited', editedAt: 2000 })
      instance.journal.reactions('42', '1', [{ emoji: '👍', count: 2 }])
      instance.journal.record(base, 'history')
      instance.journal.record(
        { ...base, text: 'edited', editedAt: 2000, reactions: [] },
        'history',
      )
      expect(instance.journal.message('42', '1')).toMatchObject({
        text: 'edited',
        reactions: [{ emoji: '👍', count: 2 }],
      })
    })
  })
})

it('starts a full MTProto handshake over a real workerd WebSocket upgrade', async () => {
  const frames: ArrayBuffer[] = []
  const sockets: WebSocket[] = []
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      expect(request.url).toMatch(
        /^https:\/\/(pluto|venus|aurora|vesta|flora)\.web\.telegram\.org\/apiws$/,
      )
      expect(request.headers.get('Sec-WebSocket-Protocol')).toBe('binary')
      const pair = new WebSocketPair()
      pair[1].binaryType = 'arraybuffer'
      pair[1].accept()
      pair[1].addEventListener('message', event => {
        if (event.data instanceof ArrayBuffer) frames.push(event.data)
      })
      sockets.push(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    })
  try {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-full-handshake'),
      async (_instance, state) => {
        const client = new TelegramClient({
          apiId: 12345,
          apiHash: 'synthetic',
          storage: createTelegramStorage(state.storage),
          crypto: new WebCryptoProvider({ wasmInput: cryptoWasm }),
          platform: workersPlatform,
          transport: new WorkersTelegramTransport(),
          logLevel: 0,
        })
        const connecting = client.connect().catch(() => {})
        try {
          await vi.waitFor(() =>
            expect(
              frames.reduce((total, frame) => total + frame.byteLength, 0),
            ).toBeGreaterThan(64),
          )
        } finally {
          await client.destroy()
          for (const socket of sockets) socket.close(1000)
          await connecting
        }
      },
    )
  } finally {
    network.mockRestore()
  }
})
