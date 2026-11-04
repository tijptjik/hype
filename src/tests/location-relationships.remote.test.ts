// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  manager: vi.fn(),
  shared: vi.fn(),
  page: vi.fn(),
  order: vi.fn(),
  lineage: vi.fn(),
  anonymous: false,
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap = (
    schema: { parse: (v: unknown) => unknown },
    handler: (v: unknown, ctx: unknown) => Promise<unknown>,
  ) =>
    withRemoteMeta(
      async (v: unknown) =>
        handler(schema.parse(v), {
          db: {},
          user: { id: 'actor', isAnonymous: mocks.anonymous },
          userRoles: [],
          event: { locals: { platform: {} } },
        }),
      'command',
    )
  return { guardedQuery: wrap, guardedCommand: wrap }
})
vi.mock('#lib/api/services/locationOwnership.js', () => ({
  requireLocationOrganisationManager: mocks.manager,
}))
vi.mock('#lib/api/services/authz/location.js', () => ({
  canManageSharedLocationIdentity: mocks.shared,
}))
vi.mock('#lib/db/services/locationRelationshipReview.js', () => ({
  readRelationshipPage: mocks.page,
  reorderLocationAddresses: mocks.order,
  readLocationLineage: mocks.lineage,
}))
vi.mock('#lib/db/services/locationRelationships.js', () => ({
  appendLocationRelationship: vi.fn(),
  appendLocationTransition: vi.fn(),
  readLocationRelationships: vi.fn(),
}))
vi.mock('#lib/db/services/locationPlacement.js', () => ({
  reconcileLocationPlacements: vi.fn(),
}))
vi.mock('#lib/api/services/feature-mtr.js', () => ({ scheduleFeatureMtr: vi.fn() }))
import * as module from '#lib/api/locationRelationships.remote.js'
const remote = mockedRemoteModule(module)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.anonymous = false
  mocks.shared.mockReturnValue(false)
  mocks.manager.mockResolvedValue(undefined)
})
it('rejects anonymous catalogue and lineage requests before reading records', async () => {
  mocks.anonymous = true
  await expect(
    remote.getRelationshipPage({
      locationId: 'building',
      organisationId: null,
      table: 'locationAddress',
      history: false,
    }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    remote.getLocationLineage({
      locationId: 'building',
      organisationId: null,
      history: false,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.page).not.toHaveBeenCalled()
  expect(mocks.lineage).not.toHaveBeenCalled()
})
it('requires shared curation authority for shared address ordering', async () => {
  await expect(
    remote.reorderAddresses({
      locationId: 'building',
      organisationId: null,
      expectedIds: [],
      orderedIds: [],
      operationId: 'op',
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.order).not.toHaveBeenCalled()
})
it('checks Organisation authority and derives the author server-side', async () => {
  await remote.reorderAddresses({
    locationId: 'building',
    organisationId: 'org',
    expectedIds: ['one'],
    orderedIds: ['one'],
    operationId: 'op',
  })
  expect(mocks.manager).toHaveBeenCalledWith(expect.anything(), 'org')
  expect(mocks.order).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ scope: 'org' }),
    'actor',
  )
  mocks.manager.mockRejectedValue({ status: 403 })
  await expect(
    remote.getLocationLineage({
      locationId: 'building',
      organisationId: 'org',
      history: true,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.lineage).not.toHaveBeenCalled()
})
it('rejects injected author or scope and bounds ordering requests', async () => {
  await expect(
    remote.reorderAddresses({
      locationId: 'building',
      organisationId: 'org',
      expectedIds: [],
      orderedIds: [],
      operationId: 'op',
      actorId: 'spoofed',
    } as never),
  ).rejects.toThrow()
  expect(mocks.order).not.toHaveBeenCalled()
})
