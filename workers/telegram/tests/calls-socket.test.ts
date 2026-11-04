import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { CallSocket, CallTickets } from '../src/calls/socket'
import type { TelegramCalls } from '../src/calls/controller'
import gateway from '../../telegram-calls/src/index'

describe('Telegram call capabilities and sockets', () => {
  it('binds one-use tickets to account, origin and viewer without storing plaintext tokens', async () => {
    let token = ''
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-tickets'),
      async (_, state) => {
        const tickets = new CallTickets(state.storage),
          viewer = 'a'.repeat(64)
        const ticket = await tickets.issue('https://hype.example', viewer)
        token = ticket.token
        expect(
          JSON.stringify(
            state.storage.sql.exec('SELECT * FROM telegram_call_tickets').toArray(),
          ),
        ).not.toContain(token)
        expect(await tickets.consume(token, 'https://other.example')).toBeNull()
        const consumed = await Promise.all([
          tickets.consume(token, 'https://hype.example'),
          tickets.consume(token, 'https://hype.example'),
        ])
        expect(consumed.filter(Boolean)).toEqual([viewer])
        const expired = await tickets.issue('https://hype.example', viewer)
        state.storage.sql.exec('UPDATE telegram_call_tickets SET expires=0')
        expect(await tickets.consume(expired.token, 'https://hype.example')).toBeNull()
      },
    )
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-tickets-other'),
      async (_, state) => {
        expect(
          await new CallTickets(state.storage).consume(token, 'https://hype.example'),
        ).toBeNull()
      },
    )
  })

  it('reserves one socket, isolates owner events, and ends calls when the viewer expires', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-call-socket'),
      async () => {
        let active = true
        const tasks: Promise<void>[] = [],
          messages: string[] = []
        const calls = {
          snapshot: () => ({ incoming: [], current: null }),
          begin: vi.fn().mockResolvedValue(undefined),
          end: vi.fn().mockResolvedValue(undefined),
          tick: vi.fn().mockResolvedValue(undefined),
          sendSignal: vi.fn().mockResolvedValue(undefined),
        }
        const socket = new CallSocket(
          calls as unknown as TelegramCalls,
          () => active,
          task => {
            tasks.push(task)
          },
        )
        const response = socket.open('a'.repeat(64))
        const client = response.webSocket!
        client.accept()
        client.addEventListener('message', event => messages.push(String(event.data)))
        expect(socket.open('b'.repeat(64)).status).toBe(409)
        client.send(
          JSON.stringify({
            kind: 'outgoing',
            requestId: 'test-call',
            to: '7',
            video: true,
          }),
        )
        await vi.waitFor(() => expect(calls.begin).toHaveBeenCalledOnce())
        const owner = calls.begin.mock.calls[0][0]
        expect(owner).toMatch(/^a{64}:/)
        socket.deliver('wrong-owner', { kind: 'error', message: 'must stay private' })
        client.send('ping')
        await vi.waitFor(() => expect(messages).toContain('pong'))
        expect(messages.some(value => value.includes('must stay private'))).toBe(false)
        active = false
        await vi.waitFor(() => expect(calls.end).toHaveBeenCalledWith(owner), {
          timeout: 1500,
        })
        await socket.close()
        await Promise.allSettled(tasks)
        expect(socket.open('a'.repeat(64)).status).toBe(401)
      },
    )
  })

  it('forwards only the capability and origin through the upgrade-only public gateway', async () => {
    const id = 'a'.repeat(64),
      token = 'b'.repeat(64)
    const forward = vi
      .fn()
      .mockResolvedValue(new Response('synthetic', { status: 401 }))
    const binding = { CALLS: { fetch: forward } } as unknown as Parameters<
      typeof gateway.fetch
    >[1]
    await gateway.fetch(
      new Request(`https://gateway.example/calls/${id}`, {
        headers: {
          Upgrade: 'websocket',
          Origin: 'https://hype.example',
          Cookie: 'must-not-forward',
          Authorization: 'must-not-forward',
          'Sec-WebSocket-Protocol': `hype.telegram.v1, token.${token}`,
        },
      }),
      binding,
    )
    const forwarded = forward.mock.calls[0][0] as Request
    expect(forwarded.headers.get('cookie')).toBeNull()
    expect(forwarded.headers.get('authorization')).toBeNull()
    expect(forwarded.headers.get('origin')).toBe('https://hype.example')
    expect(forwarded.url).toBe(`https://calls.internal/calls/${id}`)
    expect(
      (
        await gateway.fetch(
          new Request(`https://gateway.example/calls/${id}?token=${token}`),
          binding,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await gateway.fetch(
          new Request(`https://gateway.example/calls/${id}`, {
            headers: { Upgrade: 'websocket' },
          }),
          binding,
        )
      ).status,
    ).toBe(401)
    expect(forward).toHaveBeenCalledOnce()
  })

  it('accepts signed Telegram call IDs without treating them as user addresses', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('synthetic-signed-call'),
      async () => {
        const tasks: Promise<void>[] = []
        const calls = {
          snapshot: () => ({ incoming: [], current: null }),
          begin: vi.fn().mockResolvedValue(undefined),
          end: vi.fn().mockResolvedValue(undefined),
          tick: vi.fn().mockResolvedValue(undefined),
        }
        const socket = new CallSocket(
          calls as unknown as TelegramCalls,
          () => true,
          task => {
            tasks.push(task)
          },
        )
        const response = socket.open('a'.repeat(64))
        const client = response.webSocket!
        client.accept()
        try {
          client.send(
            JSON.stringify({
              kind: 'answer',
              requestId: 'signed-call',
              id: '-9223372036854775808',
            }),
          )
          await vi.waitFor(() => expect(calls.begin).toHaveBeenCalledOnce())
          expect(calls.begin.mock.calls[0][1]).toMatchObject({
            kind: 'answer',
            id: '-9223372036854775808',
          })
        } finally {
          await socket.close()
          await Promise.allSettled(tasks)
        }
      },
    )
  })
})
