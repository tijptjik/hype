// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// DOMAIN
import { resolveMapAddressChange } from '#lib/locations/resolveMapAddressChange.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const mocks = vi.hoisted(() => ({
  geocode: vi.fn(),
  units: vi.fn(),
  existing: vi.fn(),
}))
vi.mock('#lib/api/external/geocoding.js', () => ({
  geocodeAddressCandidates: mocks.geocode,
  loadGeocodedAddressUnits: mocks.units,
}))
vi.mock('#lib/api/addressLocation.remote.js', () => ({
  findDraftAddressLocation: mocks.existing,
}))
const address = (number = '238') => ({
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3] as [number, number],
  overrides: { en: { buildingNumberExpression: number, streetName: 'Hollywood Road' } },
})
const input = () => ({
  address: address(),
  conflicts: [{ field: 'number' as const, selected: '238', mapped: '242-244' }],
  projectId: 'project',
  visibility: 'shared' as const,
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.geocode.mockResolvedValue([])
  mocks.existing.mockResolvedValue(null)
  mocks.units.mockImplementation(async value => value)
})

it('uses an exact address and existing Location instead of creating a custom duplicate', async () => {
  const candidate = address('242-244')
  candidate.coordinates = [114.151, 22.3]
  candidate.source.address2dId = 'exact'
  mocks.geocode.mockResolvedValue([{ addressMeta: { address: candidate } }])
  mocks.existing.mockResolvedValue({
    locationId: 'known',
    revisionId: 'r1',
    address: candidate,
  })
  const result = await resolveMapAddressChange(input(), () => true)
  expect(result?.identity).toEqual({ locationId: 'known', revisionId: 'r1' })
  expect(result?.address.coordinates).toEqual([114.151, 22.3])
  expect(mocks.units).toHaveBeenCalledWith(candidate)
})

it('falls back to a custom record for a complete no-match lookup, never a partial number match', async () => {
  mocks.geocode.mockResolvedValue([{ addressMeta: { address: address('242') } }])
  const result = await resolveMapAddressChange(input(), () => true)
  expect(result?.identity).toBeUndefined()
  expect(result?.address.source.address2dId).toBeNull()
  expect(result?.address.source.authored?.i18n.en.buildingNumberExpression).toBe(
    '242-244',
  )
  expect(result?.address.coordinates).toEqual([114.15, 22.3])
  expect(mocks.units).not.toHaveBeenCalled()
})

it('reuses an exact custom Location even when no publication record exists', async () => {
  mocks.existing.mockResolvedValue({
    locationId: 'custom-known',
    revisionId: 'r2',
    address: address('242-244'),
  })
  expect(
    (await resolveMapAddressChange(input(), () => true))?.identity?.locationId,
  ).toBe('custom-known')
})

it('requires review on ambiguous exact matches', async () => {
  const first = address('242-244'),
    second = address('242-244')
  first.source.address2dId = 'one'
  second.source.address2dId = 'two'
  mocks.geocode.mockResolvedValue([
    { addressMeta: { address: first } },
    { addressMeta: { address: second } },
  ])
  await expect(resolveMapAddressChange(input(), () => true)).rejects.toThrow(
    'ADDRESS_MATCH_REVIEW_REQUIRED',
  )
  expect(mocks.existing).not.toHaveBeenCalled()
})

it('discards obsolete responses before querying private identities', async () => {
  expect(await resolveMapAddressChange(input(), () => false)).toBeNull()
  expect(mocks.existing).not.toHaveBeenCalled()
})

it('keeps an accepted custom draft at the dropped pin when optional lookups are unavailable', async () => {
  mocks.geocode.mockRejectedValue(new Error('offline'))
  mocks.existing.mockRejectedValue(new Error('discovery unavailable'))
  const pin: [number, number] = [114.1526, 22.2835]
  const result = await resolveMapAddressChange({ ...input(), pin }, () => true)
  expect(result?.address.coordinates).toEqual(pin)
  expect(result?.address.source.authored?.i18n.en.buildingNumberExpression).toBe(
    '242-244',
  )
  expect(result?.address.source.address2dId).toBeNull()
  expect(result?.identity).toBeUndefined()
})

it('allows a custom draft before a Project is selected and still honors discovery ambiguity', async () => {
  expect(
    (await resolveMapAddressChange({ ...input(), projectId: '' }, () => true))?.address
      .source.authored,
  ).toBeTruthy()
  expect(mocks.existing).not.toHaveBeenCalled()
  mocks.existing.mockRejectedValue(
    Object.assign(new Error('ADDRESS_MATCH_REVIEW_REQUIRED'), { status: 409 }),
  )
  await expect(resolveMapAddressChange(input(), () => true)).rejects.toThrow(
    'ADDRESS_MATCH_REVIEW_REQUIRED',
  )
})

it('retains an exact publication address when optional unit hydration fails', async () => {
  const candidate = address('242-244')
  candidate.source.address2dId = 'exact'
  mocks.geocode.mockResolvedValue([{ addressMeta: { address: candidate } }])
  mocks.units.mockRejectedValue(new Error('unit service unavailable'))
  const result = await resolveMapAddressChange(input(), () => true)
  expect(result?.address.source.address2dId).toBe('exact')
})

it('does not apply a fallback after the move has been cancelled', async () => {
  let current = true
  mocks.geocode.mockImplementation(async () => {
    current = false
    throw new Error('offline')
  })
  expect(await resolveMapAddressChange(input(), () => current)).toBeNull()
  expect(mocks.existing).not.toHaveBeenCalled()
})
