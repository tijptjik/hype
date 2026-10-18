import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  request: vi.fn(),
  event: vi.fn(),
}))
vi.mock('$app/server', () => ({
  command: (_schema: unknown, fn: (...args: unknown[]) => unknown) =>
    Object.assign(fn, { __: { type: 'command', id: '', name: '' } }),
  getRequestEvent: mocks.event,
}))
vi.mock('#lib/api/index.js', () => ({ getSessionOrError: mocks.session }))
vi.mock('#lib/api/services/routing.js', () => ({
  requestRouting: mocks.request,
  toJourney: vi.fn(),
}))
import { warmRouting } from '#lib/api/routing.remote.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.event.mockReturnValue({
    locals: { platform: { env: { ROUTING_LIMITER: { limit: mocks.limit } } } },
    request: new Request('https://hype.hk/', {
      headers: { 'cf-connecting-ip': '192.0.2.1' },
    }),
  })
  mocks.session.mockResolvedValue({ user: { id: 'guest-session', isAnonymous: true } })
  mocks.limit.mockResolvedValue({ success: true })
  mocks.request.mockResolvedValue({ ready: true })
})

it('requires a session before warming a paid engine', async () => {
  mocks.session.mockRejectedValue({ status: 401 })
  await expect(warmRouting({})).rejects.toMatchObject({ status: 401 })
  expect(mocks.limit).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})

it('limits user and IP before calling the engine', async () => {
  mocks.limit
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: false })
  await expect(warmRouting({})).rejects.toMatchObject({ status: 429 })
  expect(mocks.limit.mock.calls).toEqual([
    [{ key: 'user:guest-session' }],
    [{ key: 'ip:192.0.2.1' }],
  ])
  expect(mocks.request).not.toHaveBeenCalled()
})

it('allows an authenticated guest to warm up without supplying their location', async () => {
  await expect(warmRouting({})).resolves.toEqual({ ready: true })
  expect(mocks.request).toHaveBeenCalledWith(expect.anything(), '/warmup')
})
