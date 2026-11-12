// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { saveLocationReview } from '#lib/locations/saveLocationReview.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocationReview } from '#lib/context/locationCreation.svelte.js'
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  source: vi.fn(),
  building: vi.fn(),
  correction: vi.fn(),
  read: vi.fn(),
}))
vi.mock('#lib/api/location.remote.js', () => ({
  createLocalLocation: mocks.create,
  importDraftLocationCandidate: mocks.source,
  importFeatureLocationCandidate: mocks.source,
}))
vi.mock('#lib/api/buildingLocation.remote.js', () => ({
  importBuildingLocation: mocks.building,
}))
vi.mock('#lib/api/locationDirectory.remote.js', () => ({
  saveLocalLocationAddress: mocks.correction,
  getLocation: () =>
    Object.assign(Promise.resolve(mocks.read()), { refresh: async () => {} }),
}))
function draft(): LocationReview {
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114, 22] as [number, number],
  }
  return {
    projectId: 'project',
    organisationId: 'org',
    kind: 'establishment',
    visibility: 'shared',
    names: { en: 'Bakery' },
    originalNames: { en: 'Bakery' },
    address,
    originalAddress: structuredClone(address),
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.create.mockResolvedValue({ locationId: 'local', revisionId: 'r1' })
  mocks.source.mockResolvedValue({
    status: 'ready',
    locationId: 'source',
    revisionId: 'r1',
  })
  mocks.read.mockReturnValue({ revisionId: 'r1', organisationRevision: null })
  mocks.correction.mockResolvedValue({ revisionId: 'r1', organisationRevision: 'o1' })
})
it('creates from reviewed values and reuses the identity on a repeated Save', async () => {
  const value = draft()
  value.names.en = 'Reviewed bakery'
  value.address.coordinates = [114.1, 22.1]
  await saveLocationReview(value)
  await saveLocationReview(value)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.create.mock.calls[0][0].facts).toMatchObject({
    names: { en: 'Reviewed bakery' },
    location: { geometry: { coordinates: [114.1, 22.1] } },
  })
  expect(value.identity?.locationId).toBe('local')
})
it('imports unchanged provider evidence without generating an unnecessary correction', async () => {
  const value = {
    ...draft(),
    source: { ssId: 'source-id', resourceReleaseId: 'release' },
  }
  await saveLocationReview(value)
  expect(mocks.source).toHaveBeenCalledWith({
    projectId: 'project',
    ssId: 'source-id',
    resourceReleaseId: 'release',
  })
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.correction).not.toHaveBeenCalled()
})
it('retains an imported identity if correction fails and retries without reimporting', async () => {
  const value = {
    ...draft(),
    source: { ssId: 'source-id', resourceReleaseId: 'release' },
  }
  value.names = { en: 'Corrected' }
  mocks.correction.mockRejectedValueOnce(new Error('conflict'))
  await expect(saveLocationReview(value)).rejects.toThrow('conflict')
  expect(value.identity?.locationId).toBe('source')
  expect(value.saved).not.toBe(true)
  await saveLocationReview(value)
  expect(mocks.source).toHaveBeenCalledTimes(1)
  expect(mocks.correction).toHaveBeenLastCalledWith(
    expect.objectContaining({
      organisationId: 'org',
      names: { en: 'Corrected' },
      expectedRevisionId: 'r1',
      expectedOrganisationRevision: null,
    }),
  )
})

it.each([undefined, 'saved-feature'])(
  'excludes editor metadata from source import commands (%s)',
  async featureId => {
    const value = {
      ...draft(),
      source: {
        ssId: 'source-id',
        resourceReleaseId: 'release',
        nameMode: 'inherit' as const,
      },
    }
    await saveLocationReview(value, featureId)
    expect(mocks.source).toHaveBeenCalledWith({
      ...(featureId ? { featureId } : { projectId: 'project' }),
      ssId: 'source-id',
      resourceReleaseId: 'release',
    })
  },
)
