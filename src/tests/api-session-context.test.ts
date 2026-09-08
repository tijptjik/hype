// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase, getSessionOrError, setupRequestHandler } from '$lib/api'

const { mockClient, mockGetUserRoles } = vi.hoisted(() => ({
  mockClient: vi.fn(() => ({})),
  mockGetUserRoles: vi.fn(async () => []),
}))

vi.mock('$lib/db', () => ({ default: mockClient }))
vi.mock('$lib/db/services/user', () => ({ getUserRoles: mockGetUserRoles }))

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
