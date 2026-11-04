// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  anonymous: false,
  probe: vi.fn(),
  authorize: vi.fn(),
  nearby: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (value: unknown) => unknown },
    handler: (value: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (value: unknown) =>
        handler(schema.parse(value), {
          db: {},
          user: { id: 'actor', isAnonymous: mocks.anonymous },
        }),
      'query',
    ),
}))
vi.mock('#lib/api/services/locationOwnership.js', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
vi.mock('#lib/db/services/project.js', () => ({ probeProjectQuery: mocks.probe }))
vi.mock('#lib/db/services/locationAssociationCandidates.js', () => ({
  nearbyAssociationLocations: mocks.nearby,
}))
import { searchDraftAssociationLocations } from '#lib/api/locationAssociation.remote.js'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.anonymous = false
  mocks.probe.mockResolvedValue({ organisationId: 'owner' })
  mocks.nearby.mockResolvedValue({ rows: [], limited: false })
})
it('authorizes persisted ownership before loading matching-kind records and rejects anonymous/private reads', async () => {
  const input = {
    projectId: 'project',
    kind: 'premises' as const,
    coordinates: [114.15, 22.3] as [number, number],
  }
  mocks.anonymous = true
  await expect(searchDraftAssociationLocations(input)).rejects.toMatchObject({
    status: 403,
  })
  expect(mocks.probe).not.toHaveBeenCalled()
  mocks.anonymous = false
  mocks.authorize.mockRejectedValueOnce(new Error('denied'))
  await expect(searchDraftAssociationLocations(input)).rejects.toThrow('denied')
  expect(mocks.nearby).not.toHaveBeenCalled()
  await searchDraftAssociationLocations(input)
  expect(mocks.authorize).toHaveBeenLastCalledWith(expect.anything(), 'owner')
  expect(mocks.nearby).toHaveBeenCalledWith({}, input)
})
