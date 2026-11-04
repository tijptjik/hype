import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, expect, it, vi } from 'vitest'
import { RelayPrewarmer } from '../src/prewarm'
import RelayService, { WhatsoverRelay } from '../../whatsapp-relay/src/index'

afterEach(() => vi.restoreAllMocks())

it('routes prewarming only to the selected private account and rejects malformed requests', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 204 }))
  const getByName = vi.fn(() => ({ fetch }))
  const service = Object.create(RelayService.prototype) as RelayService
  Object.defineProperty(service, 'env', { value: { RELAYS: { getByName } } })
  expect(
    (
      await service.fetch(
        new Request('https://relay.internal/account-a/prewarm', { method: 'POST' }),
      )
    ).status,
  ).toBe(204)
  expect(getByName).toHaveBeenCalledExactlyOnceWith('account-a')
  for (const request of [
    new Request('https://relay.internal/account-b/prewarm'),
    new Request('https://relay.internal/account-b/prewarm?account=account-a', {
      method: 'POST',
    }),
    new Request('https://relay.internal/account-b/prewarm', {
      method: 'POST',
      headers: { Upgrade: 'websocket' },
    }),
    new Request('https://relay.internal/account-b/extra/prewarm', { method: 'POST' }),
  ])
    expect((await service.fetch(request)).status).toBe(404)
  expect(fetch).toHaveBeenCalledOnce()
})

it('coalesces startup, bounds retries, and warms each newly observed offer without polling keepalives', async () => {
  let now = 100_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  let finish!: () => void
  const warm = vi.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  const tasks: Promise<void>[] = []
  const prewarm = new RelayPrewarmer(warm, task => tasks.push(task))
  prewarm.request()
  prewarm.incoming([{ id: 'first' }])
  await Promise.resolve()
  expect(warm).toHaveBeenCalledOnce()
  now += 40_000
  prewarm.request()
  expect(tasks).toHaveLength(1)
  finish()
  await tasks[0]
  prewarm.incoming([{ id: 'first' }])
  expect(tasks).toHaveLength(1)
  warm.mockResolvedValue()
  prewarm.incoming([{ id: 'second' }])
  await tasks[1]
  expect(warm).toHaveBeenCalledTimes(2)
  now += 40_000
  warm.mockRejectedValueOnce(new Error('unavailable'))
  prewarm.request()
  await expect(tasks[2]).resolves.toBeUndefined()
  prewarm.request()
  expect(tasks).toHaveLength(3)
  now += 40_000
  prewarm.request()
  await tasks[3]
  expect(warm).toHaveBeenCalledTimes(4)
})

it('warms a connected view once, defers while disconnected, and leaves incoming polling nonblocking', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-prewarm-view'),
    async (instance, state) => {
      let connected = false
      let incoming: { id: string }[] = []
      const warm = vi.fn(async () => {})
      const tasks: Promise<void>[] = []
      const session = {
        status: () => JSON.stringify({ connected }),
        contactUpdates: () => '[]',
        callSnapshot: () => JSON.stringify({ incoming, current: null }),
      }
      const prewarm = new RelayPrewarmer(warm, task => tasks.push(task))
      const requested = vi.spyOn(prewarm, 'request')
      Object.assign(instance, { session, relayPrewarmer: prewarm })
      await instance.watch('viewer')
      expect(requested).not.toHaveBeenCalled()
      connected = true
      instance.callSnapshot()
      await Promise.all(tasks)
      expect(requested).toHaveBeenCalledOnce()
      await instance.watch('viewer')
      instance.callSnapshot()
      expect(requested).toHaveBeenCalledOnce()
      incoming = [{ id: 'incoming' }]
      expect(instance.callSnapshot()).toMatchObject({ incoming })
      instance.callSnapshot()
      expect(requested).toHaveBeenCalledTimes(2)
      await instance.watch('another-viewer')
      expect(requested).toHaveBeenCalledTimes(3)
      await state.storage.deleteAlarm()
      Object.assign(instance, { session: undefined })
    },
  )
})

it('prewarm shares container readiness and performs only health checks, with the normal idle timeout', async () => {
  let finish!: () => void
  const health = vi.fn(
    () =>
      new Promise<Response>(resolve => {
        finish = () => resolve(new Response('ready'))
      }),
  )
  const container = {
    running: false,
    images: { base: 'synthetic-image' },
    start: vi.fn(() => {
      container.running = true
    }),
    setInactivityTimeout: vi.fn(async () => {}),
    getTcpPort: vi.fn(() => ({ fetch: health })),
  }
  const relay = Object.create(WhatsoverRelay.prototype) as WhatsoverRelay
  Object.defineProperty(relay, 'ctx', { value: { container } })
  Object.assign(relay, { token: 'synthetic-token' })
  const first = relay.fetch(
    new Request('https://relay.internal/account/prewarm', { method: 'POST' }),
  )
  const second = relay.fetch(
    new Request('https://relay.internal/account/prewarm', { method: 'POST' }),
  )
  await vi.waitFor(() => expect(health).toHaveBeenCalledOnce())
  finish()
  expect((await first).status).toBe(204)
  expect((await second).status).toBe(204)
  expect(container.start).toHaveBeenCalledOnce()
  expect(container.setInactivityTimeout).toHaveBeenCalledWith(60_000)
  expect(health.mock.calls[0][0]).toBe('http://relay/health')
  expect(
    (await relay.fetch(new Request('https://relay.internal/account/prewarm'))).status,
  ).toBe(404)
})
