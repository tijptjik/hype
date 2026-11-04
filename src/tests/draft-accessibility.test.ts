// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// DOMAIN
import { UNKNOWN_ACCESSIBILITY } from '#lib/locations/accessibility.js'
import { saveDraftAccessibility } from '#lib/locations/saveDraftAccessibility.js'
const mocks = vi.hoisted(() => ({
  association: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}))
vi.mock('#lib/api/location.remote.js', () => ({
  getFeatureLocation: (input: unknown) =>
    Object.assign(Promise.resolve(mocks.association(input)), {
      refresh: async () => {},
    }),
}))
vi.mock('#lib/api/locationAccessibility.remote.js', () => ({
  getLocationAccessibility: (input: unknown) =>
    Object.assign(Promise.resolve(mocks.read(input)), { refresh: async () => {} }),
  updateLocationAccessibility: mocks.write,
}))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.association.mockReturnValue({ locationId: 'linked-location' })
  mocks.read.mockReturnValue({
    locationRevisionId: 'source-revision',
    record: null,
    venues: [],
  })
})
it('opening the part or leaving every answer unchanged publishes nothing', async () => {
  await saveDraftAccessibility('new-feature')
  await saveDraftAccessibility('new-feature', {})
  expect(mocks.association).not.toHaveBeenCalled()
  expect(mocks.write).not.toHaveBeenCalled()
})
it('saves explicit draft answers to the resolved linked Location with its concurrency tokens', async () => {
  await saveDraftAccessibility('new-feature', { wheelchair: 'yes', lift: 'not_needed' })
  expect(mocks.association).toHaveBeenCalledWith({ featureId: 'new-feature' })
  expect(mocks.write).toHaveBeenCalledWith({
    locationId: 'linked-location',
    expectedId: null,
    expectedLocationRevisionId: 'source-revision',
    values: { ...UNKNOWN_ACCESSIBILITY, wheelchair: 'yes', lift: 'not_needed' },
  })
})
it('preserves existing answers to fields not edited in the draft', async () => {
  mocks.read.mockReturnValue({
    locationRevisionId: 'source',
    record: {
      id: 'head',
      stale: false,
      values: { ...UNKNOWN_ACCESSIBILITY, toilet: 'yes' },
    },
  })
  await saveDraftAccessibility('new-feature', { wheelchair: 'limited' })
  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedId: 'head',
      values: { ...UNKNOWN_ACCESSIBILITY, toilet: 'yes', wheelchair: 'limited' },
    }),
  )
})
it('does not overwrite conflicting known answers or reconfirm stale placement reports', async () => {
  mocks.read.mockReturnValue({
    locationRevisionId: 'source',
    record: { id: 'head', values: { ...UNKNOWN_ACCESSIBILITY, wheelchair: 'no' } },
  })
  await expect(
    saveDraftAccessibility('new-feature', { wheelchair: 'yes' }),
  ).rejects.toThrow('ACCESSIBILITY_REVIEW_REQUIRED')
  mocks.read.mockReturnValue({
    locationRevisionId: 'source',
    record: { id: 'head', stale: true, values: UNKNOWN_ACCESSIBILITY },
  })
  await expect(
    saveDraftAccessibility('new-feature', { wheelchair: 'yes' }),
  ).rejects.toThrow('ACCESSIBILITY_REVIEW_REQUIRED')
  expect(mocks.write).not.toHaveBeenCalled()
})
it('can retry a failed save without duplicating a completed contribution', async () => {
  mocks.write.mockRejectedValueOnce(new Error('network'))
  await expect(
    saveDraftAccessibility('new-feature', { wheelchair: 'yes' }),
  ).rejects.toThrow('network')
  await saveDraftAccessibility('new-feature', { wheelchair: 'yes' })
  mocks.read.mockReturnValue({
    locationRevisionId: 'source',
    record: {
      id: 'head',
      stale: false,
      values: { ...UNKNOWN_ACCESSIBILITY, wheelchair: 'yes' },
    },
  })
  await saveDraftAccessibility('new-feature', { wheelchair: 'yes' })
  expect(mocks.write).toHaveBeenCalledTimes(2)
})
it('does not write before association or when the linked subject is unavailable', async () => {
  mocks.association.mockReturnValue(null)
  await expect(
    saveDraftAccessibility('new-feature', { wheelchair: 'yes' }),
  ).rejects.toThrow('ACCESSIBILITY_LOCATION_REQUIRED')
  mocks.association.mockReturnValue({ locationId: 'private' })
  mocks.read.mockReturnValue(null)
  await expect(
    saveDraftAccessibility('new-feature', { wheelchair: 'yes' }),
  ).rejects.toThrow('ACCESSIBILITY_LOCATION_REQUIRED')
  expect(mocks.write).not.toHaveBeenCalled()
})
