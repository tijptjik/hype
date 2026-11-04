// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { customMapAddressChange } from '#lib/addresses/mapAddressChange.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

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
vi.mock('#lib/db/services/locationCandidate.js', () => ({
  nearbyLocalLocationCandidates: mocks.nearby,
}))
import { findDraftAddressLocation } from '#lib/api/addressLocation.remote.js'

const address = () => ({
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3] as [number, number],
  overrides: {
    en: { streetName: 'Hollywood Road', buildingNumberExpression: '242-244' },
  },
})
const input = () => ({
  projectId: 'project',
  address: address(),
  visibility: 'shared' as const,
})
const candidate = (locationId = 'known', state = 'unresolved', kind = 'address') => ({
  locationId,
  revisionId: 'r1',
  state,
  kind,
  facts: localIdentityFromAddress('address', {}, customMapAddressChange(address()))
    .facts,
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.anonymous = false
  mocks.probe.mockResolvedValue({ organisationId: 'owner' })
  mocks.nearby.mockResolvedValue({ candidates: [], limited: false })
})

it('authorizes persisted Organisation ancestry before reading private address candidates', async () => {
  mocks.anonymous = true
  await expect(findDraftAddressLocation(input())).rejects.toMatchObject({ status: 403 })
  expect(mocks.probe).not.toHaveBeenCalled()
  mocks.anonymous = false
  mocks.authorize.mockRejectedValueOnce(new Error('denied'))
  await expect(findDraftAddressLocation(input())).rejects.toThrow('denied')
  expect(mocks.nearby).not.toHaveBeenCalled()
  await findDraftAddressLocation(input())
  expect(mocks.authorize).toHaveBeenLastCalledWith(expect.anything(), 'owner')
  expect(mocks.nearby).toHaveBeenCalledWith(
    {},
    { projectId: 'project', coordinates: [114.15, 22.3], radius: 1000 },
  )
})

it('returns only an exact address identity with matching visibility, never a building or private substitute', async () => {
  mocks.nearby.mockResolvedValue({
    candidates: [
      candidate('private', 'manual'),
      candidate('building', 'unresolved', 'building'),
      candidate(),
    ],
    limited: false,
  })
  expect(await findDraftAddressLocation(input())).toMatchObject({
    locationId: 'known',
    revisionId: 'r1',
  })
  expect(
    await findDraftAddressLocation({ ...input(), visibility: 'exclusive' }),
  ).toMatchObject({ locationId: 'private' })
})

it('requires review for multiple exact identities or incomplete discovery', async () => {
  mocks.nearby.mockResolvedValue({
    candidates: [candidate('one'), candidate('two')],
    limited: false,
  })
  await expect(findDraftAddressLocation(input())).rejects.toMatchObject({ status: 409 })
  mocks.nearby.mockResolvedValue({ candidates: [candidate()], limited: true })
  await expect(findDraftAddressLocation(input())).rejects.toMatchObject({ status: 409 })
})
