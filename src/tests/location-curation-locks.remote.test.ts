// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  superAdmin: false,
  anonymous: false,
  read: vi.fn(),
  save: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const remote = (
    schema: { parse(value: unknown): unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) =>
        handler(schema.parse(input), {
          db: {},
          user: {
            id: 'actor',
            superAdmin: mocks.superAdmin,
            isAnonymous: mocks.anonymous,
          },
        }),
      'command',
    )
  return { guardedCommand: remote, guardedQuery: remote }
})
vi.mock('#lib/db/services/locationCurationLocks.js', () => ({
  readLocationCurationLocks: mocks.read,
  saveLocationCurationLocks: mocks.save,
}))
import {
  getCommunityCurationLocks,
  setCommunityCurationLocks,
} from '#lib/api/locationCurationLocks.remote.js'
const input = {
  locationId: 'place',
  expectedRevision: null,
  openFields: { names: false },
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.superAdmin = false
  mocks.anonymous = false
  mocks.save.mockResolvedValue({
    revision: 'new',
    openFields: { names: false },
    available: true,
  })
})
it.each([
  { superAdmin: false, anonymous: false },
  { superAdmin: true, anonymous: true },
])(
  'rejects unprivileged lock administration before storage access: %j',
  async flags => {
    Object.assign(mocks, flags)
    await expect(setCommunityCurationLocks(input)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      getCommunityCurationLocks({ locationId: 'place' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  },
)
it('attributes a SuperAdmin decision to the server session and retains its expected revision', async () => {
  mocks.superAdmin = true
  await setCommunityCurationLocks(input)
  expect(mocks.save).toHaveBeenCalledWith(
    {},
    { ...input, actorId: 'actor', superAdmin: true },
  )
  mocks.save.mockResolvedValue(null)
  await expect(setCommunityCurationLocks(input)).rejects.toMatchObject({ status: 409 })
})
it('does not accept a client-supplied administrator claim', async () => {
  await expect(
    setCommunityCurationLocks({ ...input, superAdmin: true } as never),
  ).rejects.toThrow()
  expect(mocks.save).not.toHaveBeenCalled()
})
