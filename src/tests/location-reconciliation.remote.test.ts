// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  shared: vi.fn(),
  baseline: vi.fn(),
  capture: vi.fn(),
  publication: vi.fn(),
  find: vi.fn(),
  ctx: {
    user: { isAnonymous: false, id: 'admin' },
    userRoles: {},
    db: { get: vi.fn(), all: vi.fn() },
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test' } } },
      fetch: vi.fn(),
    },
  },
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (kind: 'query' | 'command') =>
    (
      schema: { parse: (input: unknown) => unknown },
      handler: (input: unknown, ctx: unknown) => Promise<unknown>,
    ) =>
      withRemoteMeta(
        async (input: unknown) => handler(schema.parse(input), mocks.ctx),
        kind,
      )
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
vi.mock('#lib/db/services/locationBaseline.js', () => ({
  readFeatureLocationBaseline: async () => ({
    status: 'ready',
    baseline: { effective: { phoneNumber: [] } },
  }),
}))
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
vi.mock('#lib/api/services/authz/location', () => ({
  canManageSharedLocationIdentity: mocks.shared,
}))
vi.mock('#lib/db/services/locationIdentityReview.js', () => ({
  readLocationIdentityBaseline: mocks.baseline,
  captureLocationIdentityReview: mocks.capture,
}))
vi.mock('#lib/locations/publication.js', () => ({
  discoverLocationPublication: mocks.publication,
}))
vi.mock('#lib/locations/sourceLookup.js', () => ({ findSaanSeoiPlace: mocks.find }))
vi.mock('#lib/locations/sourceEndpoint.server.js', () => ({
  locationSourceEndpoint: () => ({ baseUrl: 'https://source.invalid', apiKey: 'test' }),
}))
import {
  getLocationReconciliation,
  prepareReconciliationMatch,
  markReconciliationUnavailable,
  resetReconciliationUnavailable,
  getUnavailableReconciliation,
  getMatchedReconciliation,
} from '#lib/api/locationReconciliation.remote.js'
const input = {
  project: 'project',
  featureId: 'feature',
  locationId: 'local',
  ssId: 'ss-one',
  resourceReleaseId: 'release',
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.ctx.user.isAnonymous = false
  mocks.ctx.db.get
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org', name: 'Project' })
    .mockResolvedValue({ ownerOrganisationId: 'org' })
  mocks.baseline.mockResolvedValue({ locationId: 'local' })
  mocks.publication.mockResolvedValue({ pin: { releaseSet: 'pin' } })
  mocks.find.mockResolvedValue({
    projection: {
      ssId: 'ss-one',
      releaseId: 'release',
      facts: { names: { en: 'Bakery' } },
    },
  })
  mocks.capture.mockResolvedValue('review')
})
it('blocks private queue reads before loading records when organisation access is denied', async () => {
  mocks.authorize.mockRejectedValue(new Error('denied'))
  await expect(getLocationReconciliation({ project: 'project' })).rejects.toThrow(
    'denied',
  )
  expect(mocks.ctx.db.get).toHaveBeenCalledTimes(1)
  expect(mocks.ctx.db.all).not.toHaveBeenCalled()
})
it('rejects anonymous reads before probing project data', async () => {
  mocks.ctx.user.isAnonymous = true
  await expect(getLocationReconciliation({ project: 'project' })).rejects.toMatchObject(
    { status: 403 },
  )
  expect(mocks.ctx.db.get).not.toHaveBeenCalled()
})
it('retains the existing Location and captures canonical evidence without accepting identity', async () => {
  expect(await prepareReconciliationMatch(input)).toEqual({
    reviewId: 'review',
    facts: { names: { en: 'Bakery' } },
  })
  expect(mocks.capture.mock.calls[0][1]).toEqual({ locationId: 'local' })
  expect(mocks.find).toHaveBeenCalledWith(
    expect.anything(),
    { releaseSet: 'pin' },
    'ss-one',
  )
})
it('rejects an association that moved since discovery before contacting upstream', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce(null)
  await expect(prepareReconciliationMatch(input)).rejects.toMatchObject({ status: 409 })
  expect(mocks.find).not.toHaveBeenCalled()
})
it('does not freeze evidence from a changed source release', async () => {
  mocks.find.mockResolvedValue({ projection: { ssId: 'ss-one', releaseId: 'changed' } })
  await expect(prepareReconciliationMatch(input)).rejects.toMatchObject({ status: 409 })
  expect(mocks.capture).not.toHaveBeenCalled()
})
it('requires separate shared identity authority for an ownerless Location', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce({ ownerOrganisationId: null })
  mocks.shared.mockReturnValue(false)
  await expect(prepareReconciliationMatch(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.find).not.toHaveBeenCalled()
})

it('returns a Feature without a Location using its own search geometry', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org', name: 'Project' })
    .mockResolvedValueOnce({ total: 2, matched: 1, unavailable: 0, remaining: 1 })
    .mockResolvedValueOnce({
      id: 'feature',
      name: 'Bakery',
      modifiedAt: 'now',
      geometry: '{"type":"Point","coordinates":[114,22]}',
      locationId: null,
      facts: null,
      address: null,
    })
    .mockResolvedValueOnce(null)
  mocks.ctx.db.all
    .mockResolvedValueOnce([{ id: 'name', label: 'Name' }])
    .mockResolvedValueOnce([
      { id: 'name', value: 'First' },
      { id: 'name', value: 'Second' },
    ])
  const result = await getLocationReconciliation({ project: 'project' })
  expect(result.item).toMatchObject({
    locationId: null,
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: { name: 'First Second' },
  })
  expect(result.counts).toEqual({ total: 2, matched: 1, unavailable: 0, remaining: 1 })
})

it('records an explicit unavailable disposition after checking the Location owner without requesting upstream', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce({ ownerOrganisationId: 'location-owner' })
    .mockResolvedValueOnce({ lastManualMatchAttemptAt: '2026-11-14T00:00:00.000Z' })
  expect(
    await markReconciliationUnavailable({
      project: 'project',
      featureId: 'feature',
      locationId: 'local',
    }),
  ).toEqual({ lastManualMatchAttemptAt: '2026-11-14T00:00:00.000Z' })
  expect(mocks.authorize).toHaveBeenLastCalledWith(mocks.ctx, 'location-owner')
  expect(mocks.find).not.toHaveBeenCalled()
})
it('rejects an unavailable disposition when the Location changes after the permission check', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce({ ownerOrganisationId: 'org' })
    .mockResolvedValueOnce(null)
  await expect(
    markReconciliationUnavailable({
      project: 'project',
      featureId: 'feature',
      locationId: 'local',
    }),
  ).rejects.toMatchObject({ status: 409 })
})
it('does not write an unavailable disposition when organisation authority is denied', async () => {
  mocks.authorize.mockRejectedValue(new Error('denied'))
  await expect(
    markReconciliationUnavailable({
      project: 'project',
      featureId: 'feature',
      locationId: 'local',
    }),
  ).rejects.toThrow('denied')
  expect(mocks.ctx.db.get).toHaveBeenCalledTimes(1)
})

it('requires project authority before listing unavailable Features', async () => {
  mocks.authorize.mockRejectedValue(new Error('denied'))
  await expect(getUnavailableReconciliation({ project: 'project' })).rejects.toThrow(
    'denied',
  )
  expect(mocks.ctx.db.all).not.toHaveBeenCalled()
})
it('requires shared identity authority before resetting an ownerless Location', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce({ ownerOrganisationId: null })
  mocks.shared.mockReturnValue(false)
  await expect(
    resetReconciliationUnavailable({
      project: 'project',
      featureId: 'feature',
      locationId: 'local',
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.ctx.db.get).toHaveBeenCalledTimes(2)
})
it('rechecks the association atomically when resetting unavailable state', async () => {
  mocks.ctx.db.get
    .mockReset()
    .mockResolvedValueOnce({ id: 'project', organisationId: 'org' })
    .mockResolvedValueOnce({ ownerOrganisationId: 'location-owner' })
    .mockResolvedValueOnce(null)
  await expect(
    resetReconciliationUnavailable({
      project: 'project',
      featureId: 'feature',
      locationId: 'local',
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(mocks.authorize).toHaveBeenLastCalledWith(mocks.ctx, 'location-owner')
})

it('requires project authority before listing matched Features', async () => {
  mocks.authorize.mockRejectedValue(new Error('denied'))
  await expect(getMatchedReconciliation({ project: 'project' })).rejects.toThrow(
    'denied',
  )
  expect(mocks.ctx.db.all).not.toHaveBeenCalled()
})
