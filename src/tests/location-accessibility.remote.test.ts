// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'
import { UNKNOWN_ACCESSIBILITY } from '#lib/locations/accessibility.js'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(async () => {}),
  anonymous: false,
  roles: [] as { type: string; role: string }[],
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap = (
    schema: { parse: (v: unknown) => unknown },
    handler: (v: unknown, ctx: unknown) => Promise<unknown>,
  ) => {
    const fn = withRemoteMeta(
      async (v: unknown) =>
        handler(schema.parse(v), {
          db: {},
          user: { id: 'session-actor', isAnonymous: mocks.anonymous },
          userRoles: mocks.roles,
        }),
      'command',
    )
    // The mutation refreshes the query handle after committing.
    return Object.assign(
      (v: unknown) => Object.assign(fn(v), { refresh: mocks.refresh }),
      fn,
    )
  }
  return { guardedCommand: wrap, guardedQuery: wrap }
})
vi.mock('#lib/db/services/locationAccessibility.js', () => ({
  readLocationAccessibility: mocks.read,
  saveLocationAccessibility: mocks.save,
}))
import * as module from '#lib/api/locationAccessibility.remote.js'
const remote = mockedRemoteModule(module)
const input = {
  locationId: 'shop',
  expectedId: null,
  expectedLocationRevisionId: 'v1',
  values: UNKNOWN_ACCESSIBILITY,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.anonymous = false
  mocks.roles = []
  mocks.save.mockResolvedValue('new')
})
it('rejects anonymous actors and ordinary users before reading or writing', async () => {
  for (const anonymous of [true, false]) {
    mocks.anonymous = anonymous
    await expect(
      remote.getLocationAccessibility({ locationId: 'shop' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(remote.updateLocationAccessibility(input)).rejects.toMatchObject({
      status: 403,
    })
  }
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('allows admin-panel contributors without Location ownership and attributes the authenticated actor', async () => {
  mocks.roles = [{ type: 'project', role: 'maintainer' }]
  await remote.updateLocationAccessibility(input)
  expect(mocks.save).toHaveBeenCalledWith({}, input, 'session-actor')
})
it('returns a conflict rather than silently overwriting another revision', async () => {
  mocks.roles = [{ type: 'hub', role: 'admin' }]
  mocks.save.mockRejectedValue(new Error('ACCESSIBILITY_CHANGED'))
  await expect(remote.updateLocationAccessibility(input)).rejects.toMatchObject({
    status: 409,
  })
})

it.each(['refresh failed', 'ACCESSIBILITY_CHANGED'])(
  'returns the committed revision when query refresh fails with %s',
  async message => {
    mocks.roles = [{ type: 'project', role: 'maintainer' }]
    mocks.refresh.mockRejectedValueOnce(new Error(message))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(remote.updateLocationAccessibility(input)).resolves.toEqual({
        id: 'new',
      })
      expect(mocks.save).toHaveBeenCalledOnce()
      expect(logged).toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  },
)
