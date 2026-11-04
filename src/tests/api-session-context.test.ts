// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase, getSessionOrError, setupRequestHandler } from '#lib/api/index.js'

const { mockClient, mockGetUserRoles } = vi.hoisted(() => ({
  mockClient: vi.fn(() => ({})),
  mockGetUserRoles: vi.fn(async () => []),
}))

vi.mock('#lib/db/index.js', () => ({ default: mockClient }))
vi.mock('#lib/db/services/user.js', () => ({ getUserRoles: mockGetUserRoles }))

describe('shared API session context', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([{}, { session: { id: 'session-1' } }, { user: { id: 'user-1' } }])(
    'rejects incomplete session context before DB access: %j',
    async partial => {
      const locals = partial as App.Locals
      const failure = { status: 401, body: { message: 'UNAUTHENTICATED' } }
      await expect(getSessionOrError(locals)).rejects.toMatchObject(failure)
      await expect(
        setupRequestHandler({
          locals,
          platform: undefined,
          request: new Request('https://example.test/api'),
        }),
      ).rejects.toMatchObject(failure)
      await expect(getDatabase(locals, undefined)).rejects.toMatchObject(failure)
      expect(mockClient).not.toHaveBeenCalled()
      expect(mockGetUserRoles).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])('preserves valid sessions (guest=%s)', async isAnonymous => {
    const locals = {
      session: { id: 'session-1' },
      user: { id: 'user-1', isAnonymous },
    } as App.Locals
    await expect(getSessionOrError(locals)).resolves.toEqual(locals)
  })
})

it('reloads persisted roles on each request instead of trusting retained session roles', async () => {
  const retained = [{ type: 'organisation', organisationId: 'org', role: 'owner' }]
  const current = [{ type: 'organisation', organisationId: 'org', role: 'member' }]
  const locals = {
    session: { id: 'session-1' },
    user: { id: 'user-1', isAnonymous: false, roles: retained },
  } as unknown as App.Locals
  const event = {
    locals,
    platform: { env: { DB: {} } } as App.Platform,
    request: new Request('https://example.test/api'),
  }
  mockGetUserRoles.mockResolvedValueOnce(current as never).mockResolvedValueOnce([])
  expect((await setupRequestHandler(event)).userRoles).toEqual(current)
  expect((await setupRequestHandler(event)).userRoles).toEqual([])
  expect(mockGetUserRoles).toHaveBeenLastCalledWith(expect.anything(), 'user-1')
})

it('does not load persisted role grants for an authenticated guest', async () => {
  mockGetUserRoles.mockClear()
  const result = await setupRequestHandler({
    locals: {
      session: { id: 'guest-session' },
      user: { id: 'guest', isAnonymous: true, roles: [{ role: 'owner' }] },
    } as unknown as App.Locals,
    platform: { env: { DB: {} } } as App.Platform,
    request: new Request('https://example.test/api'),
  })
  expect(result.userRoles).toEqual([])
  expect(mockGetUserRoles).not.toHaveBeenCalled()
})

it('fails request setup when the current role lookup fails', async () => {
  const failure = new Error('synthetic role lookup failure')
  mockGetUserRoles.mockRejectedValueOnce(failure)
  await expect(
    setupRequestHandler({
      locals: {
        session: { id: 'session-1' },
        user: { id: 'user-1', isAnonymous: false },
      } as App.Locals,
      platform: { env: { DB: {} } } as App.Platform,
      request: new Request('https://example.test/api'),
    }),
  ).rejects.toBe(failure)
})
