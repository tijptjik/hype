// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  anonymous: false,
  probe: vi.fn(),
  authorize: vi.fn(),
  persist: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedCommand: (
    schema: { parse: (value: unknown) => unknown },
    handler: (value: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (value: unknown) =>
        handler(schema.parse(value), {
          db: {},
          user: { id: 'actor', isAnonymous: mocks.anonymous },
        }),
      'command',
    ),
}))
vi.mock('#lib/api/services/locationOwnership.js', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
vi.mock('#lib/db/services/project.js', () => ({ probeProjectQuery: mocks.probe }))
vi.mock('#lib/db/services/locationBuilding.js', () => ({
  importBuildingLocation: mocks.persist,
}))
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
const input = {
  projectId: 'project',
  source: { id: 'gers', release: 'r1' },
  visibility: 'shared' as const,
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.anonymous = false
  mocks.probe.mockResolvedValue({ organisationId: 'owner' })
})
it('authorizes persisted Organisation ownership before reading exports or writing', async () => {
  mocks.anonymous = true
  await expect(importBuildingLocation(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.probe).not.toHaveBeenCalled()
  mocks.anonymous = false
  mocks.authorize.mockRejectedValueOnce(new Error('denied'))
  await expect(importBuildingLocation(input)).rejects.toThrow('denied')
  expect(mocks.persist).not.toHaveBeenCalled()
  await importBuildingLocation(input)
  expect(mocks.persist).toHaveBeenCalledExactlyOnceWith(
    {},
    'owner',
    input.source,
    'shared',
    'actor',
    undefined,
  )
})
