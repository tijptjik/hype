import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { Long, type tl } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/core/client.js'
import { describe, expect, it, vi } from 'vitest'
import { CallKeyExchange, TELEGRAM_CALL_PRIME } from '../src/calls/crypto'
import { TelegramCalls, type CallOwnerEvent } from '../src/calls/controller'

const prime = Uint8Array.from(Buffer.from(TELEGRAM_CALL_PRIME, 'hex'))
const config = {
  _: 'messages.dhConfig',
  g: 3,
  p: prime,
  random: new Uint8Array(256),
  version: 1,
} as const
const protocol = {
  _: 'phoneCallProtocol',
  minLayer: 65,
  maxLayer: 92,
  udpP2p: true,
  udpReflector: true,
  libraryVersions: ['13.0.0'],
} as const
const callId = Long.fromInt(123),
  accessHash = Long.fromInt(456)

/** Synthetic provider envelope; it contains no real account or network endpoint. */
function waiting(outgoing: boolean): tl.RawPhoneCallWaiting {
  return {
    _: 'phoneCallWaiting',
    id: callId,
    accessHash,
    date: Math.floor(Date.now() / 1000),
    adminId: outgoing ? 42 : 7,
    participantId: outgoing ? 7 : 42,
    protocol: { ...protocol, libraryVersions: [...protocol.libraryVersions] },
  }
}

function confirmed(
  outgoing: boolean,
  publicValue: Uint8Array,
  fingerprint: string,
): tl.RawPhoneCall {
  return {
    ...waiting(outgoing),
    _: 'phoneCall',
    gAOrB: publicValue,
    keyFingerprint: Long.fromString(fingerprint),
    p2pAllowed: true,
    startDate: Math.floor(Date.now() / 1000),
    connections: [
      {
        _: 'phoneConnectionWebrtc',
        id: Long.ONE,
        ip: '192.0.2.1',
        ipv6: '',
        port: 3478,
        stun: true,
        turn: true,
        username: 'synthetic',
        password: 'synthetic',
      },
    ],
  }
}

describe('Organisation Telegram call ownership', () => {
  it('verifies outgoing DH, confirms once, and isolates the owning operator', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-outgoing'),
      async (_, state) => {
        const peer = CallKeyExchange.create(prime, 3, new Uint8Array(256))
        const owner = vi.fn(),
          publish = vi.fn(),
          tasks: Promise<void>[] = []
        let commitment: Uint8Array | undefined
        const rpc = vi.fn().mockImplementation(async (request: tl.RpcMethod) => {
          switch (request._) {
            case 'messages.getDhConfig':
              return config
            case 'phone.requestCall':
              commitment = request.gAHash
              return { _: 'phone.phoneCall', phoneCall: waiting(true), users: [] }
            case 'phone.confirmCall': {
              const derived = await peer.derive(request.gA, commitment)
              expect(request.keyFingerprint.toString()).toBe(derived.fingerprint)
              return {
                _: 'phone.phoneCall',
                phoneCall: confirmed(true, peer.publicValue, derived.fingerprint),
                users: [],
              }
            }
            default:
              return true
          }
        })
        const client = {
          call: rpc,
          resolveUser: vi
            .fn()
            .mockResolvedValue({ _: 'inputUser', userId: 7, accessHash: Long.ONE }),
        } as unknown as TelegramClient
        const calls = new TelegramCalls(state.storage, {
          client: () => client,
          self: () => '42',
          owner,
          publish,
          keepAlive: task => {
            tasks.push(task)
          },
        })
        try {
          await calls.begin('operator-a', {
            kind: 'outgoing',
            requestId: 'call-1',
            to: '7',
          })
          await expect(
            calls.begin('operator-b', {
              kind: 'outgoing',
              requestId: 'call-2',
              to: '7',
            }),
          ).rejects.toThrow('owns')
          const accepted: tl.RawPhoneCallAccepted = {
            ...waiting(true),
            _: 'phoneCallAccepted',
            gB: peer.publicValue,
          }
          await Promise.all([calls.update(accepted), calls.update(accepted)])
          expect(
            rpc.mock.calls.filter(([request]) => request._ === 'phone.confirmCall'),
          ).toHaveLength(1)
          expect(
            owner.mock.calls.filter(([, event]) => event.kind === 'setup'),
          ).toHaveLength(1)
          expect(owner.mock.calls[0][0]).toBe('operator-a')
          expect(owner.mock.calls[0][1]).toMatchObject({
            kind: 'setup',
            setup: {
              outgoing: true,
              p2pAllowed: true,
              iceServers: expect.arrayContaining([{ urls: ['stun:192.0.2.1:3478'] }]),
            },
          })
          expect(JSON.stringify(owner.mock.calls)).not.toContain('accessHash')
          expect(() => calls.connected('operator-b')).toThrow('own')
          calls.connected('operator-a')
          await calls.update(waiting(true))
          expect(calls.snapshot().current?.phase).toBe('active')
          await expect(calls.end('operator-b')).rejects.toThrow('owns')
          await calls.end('operator-a')
          expect(calls.snapshot().current?.phase).toBe('ended')
          await expect(
            calls.begin('operator-b', {
              kind: 'outgoing',
              requestId: 'call-1',
              to: '7',
            }),
          ).rejects.toThrow('already submitted')
        } finally {
          await calls.end()
          peer.dispose()
          await Promise.allSettled(tasks)
        }
      },
    )
  })

  it('processes an incoming confirmation before the accept response without deriving twice', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-incoming'),
      async (_, state) => {
        const caller = CallKeyExchange.create(prime, 3, new Uint8Array(256))
        const requested: tl.RawPhoneCallRequested = {
          ...waiting(false),
          _: 'phoneCallRequested',
          gAHash: await caller.commitment(),
          video: true,
        }
        const events: CallOwnerEvent[] = [],
          tasks: Promise<void>[] = []
        let final!: tl.RawPhoneCall
        const rpc = vi.fn().mockImplementation(async (request: tl.RpcMethod) => {
          if (request._ === 'messages.getDhConfig') return config
          if (request._ === 'phone.acceptCall') {
            const derived = await caller.derive(request.gB)
            final = {
              ...confirmed(false, caller.publicValue, derived.fingerprint),
              video: true,
            }
            await Promise.all([calls.update(final), calls.update(final)])
            return { _: 'phone.phoneCall', phoneCall: waiting(false), users: [] }
          }
          return true
        })
        const client = { call: rpc } as unknown as TelegramClient
        const calls = new TelegramCalls(state.storage, {
          client: () => client,
          self: () => '42',
          owner: (_, event) => events.push(event),
          publish: () => {},
          keepAlive: task => {
            tasks.push(task)
          },
        })
        try {
          await calls.update(requested)
          await calls.update(requested)
          expect(
            rpc.mock.calls.filter(([request]) => request._ === 'phone.receivedCall'),
          ).toHaveLength(1)
          expect(
            rpc.mock.calls.some(([request]) => request._ === 'phone.acceptCall'),
          ).toBe(false)
          expect(calls.snapshot().incoming[0]).toMatchObject({ id: '123', video: true })
          await expect(
            calls.begin('a', { kind: 'answer', requestId: 'incoming-1', id: '123' }),
          ).rejects.toThrow('video action')
          await calls.begin('a', {
            kind: 'answer',
            requestId: 'incoming-1',
            id: '123',
            video: true,
          })
          expect(events.filter(event => event.kind === 'setup')).toHaveLength(1)
          expect(events.some(event => event.kind === 'error')).toBe(false)
          expect(calls.snapshot().incoming).toEqual([])
          await expect(calls.reject('123')).rejects.toThrow('no longer available')
          calls.connected('a')
          expect(calls.snapshot().current).toMatchObject({
            phase: 'active',
            video: true,
          })
        } finally {
          await calls.end()
          caller.dispose()
          await Promise.allSettled(tasks)
        }
      },
    )
  })

  it('keeps the ownership reservation until cancelled setup has actually settled', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-cancel'),
      async (_, state) => {
        let resume!: (value: typeof config) => void
        const rpc = vi.fn().mockImplementation(
          () =>
            new Promise(resolve => {
              resume = resolve
            }),
        )
        const client = { call: rpc } as unknown as TelegramClient
        const calls = new TelegramCalls(state.storage, {
          client: () => client,
          self: () => '42',
          owner: () => {},
          publish: () => {},
          keepAlive: () => {},
        })
        const attempt = calls
          .begin('a', { kind: 'outgoing', requestId: 'cancel-1', to: '7' })
          .catch(error => error)
        await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce())
        await calls.end('a')
        await expect(
          calls.begin('b', { kind: 'outgoing', requestId: 'cancel-2', to: '7' }),
        ).rejects.toThrow('owns')
        resume(config)
        expect(await attempt).toBeInstanceOf(Error)
        expect(
          rpc.mock.calls.some(([request]) => request._ === 'phone.requestCall'),
        ).toBe(false)
      },
    )
  })

  it('never releases media setup when the peer fingerprint is wrong', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-fingerprint'),
      async (_, state) => {
        const caller = CallKeyExchange.create(prime, 3, new Uint8Array(256))
        const owner = vi.fn()
        const rpc = vi
          .fn()
          .mockImplementation(async (request: tl.RpcMethod) =>
            request._ === 'messages.getDhConfig'
              ? config
              : request._ === 'phone.acceptCall'
                ? { _: 'phone.phoneCall', phoneCall: waiting(false), users: [] }
                : true,
          )
        const client = { call: rpc } as unknown as TelegramClient
        const calls = new TelegramCalls(state.storage, {
          client: () => client,
          self: () => '42',
          owner,
          publish: () => {},
          keepAlive: () => {},
        })
        await calls.update({
          ...waiting(false),
          _: 'phoneCallRequested',
          gAHash: await caller.commitment(),
        })
        await calls.begin('a', {
          kind: 'answer',
          requestId: 'bad-fingerprint',
          id: '123',
        })
        await calls.update(confirmed(false, caller.publicValue, '1'))
        expect(calls.snapshot().current?.phase).toBe('ended')
        expect(owner.mock.calls.some(([, event]) => event.kind === 'setup')).toBe(false)
        expect(
          rpc.mock.calls.some(([request]) => request._ === 'phone.discardCall'),
        ).toBe(true)
        caller.dispose()
      },
    )
  })
})
