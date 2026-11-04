import { beforeEach, expect, it, vi } from 'vitest'
import { linkDraftPlace } from '#lib/locations/linkDraftPlace.js'
const mocks = vi.hoisted(() => ({
  existing: vi.fn(),
  candidate: vi.fn(),
  import: vi.fn(),
  link: vi.fn(),
  relink: vi.fn(),
}))
vi.mock('#lib/api/location.remote.js', () => ({
  getFeatureLocation: () =>
    Object.assign(Promise.resolve(mocks.existing()), { refresh: async () => {} }),
  getFeatureLocationCandidate: mocks.candidate,
  importFeatureLocationCandidate: mocks.import,
  linkFeatureLocation: mocks.link,
  relinkFeatureLocation: mocks.relink,
}))
const input = {
  featureId: 'created-id',
  modifiedAt: 'timestamp',
  ssId: 'source-id',
  resourceReleaseId: 'release',
}
const ready = { status: 'ready', locationId: 'location', revisionId: 'revision' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.existing.mockReturnValue(null)
  mocks.candidate.mockResolvedValue(ready)
})
it('links the persisted Feature using the resolved immutable revision', async () => {
  await linkDraftPlace(input)
  expect(mocks.link).toHaveBeenCalledWith({
    featureId: 'created-id',
    expectedFeatureModifiedAt: 'timestamp',
    locationId: 'location',
    revisionId: 'revision',
  })
})
it('imports only the pinned source identity when necessary', async () => {
  mocks.candidate.mockResolvedValue({ status: 'source-import-needed' })
  mocks.import.mockResolvedValue(ready)
  await linkDraftPlace(input)
  expect(mocks.import).toHaveBeenCalledWith({
    featureId: 'created-id',
    ssId: 'source-id',
    resourceReleaseId: 'release',
  })
})
it('treats a completed matching link as successful on retry', async () => {
  mocks.existing.mockReturnValue({ locationId: 'location' })
  await linkDraftPlace(input)
  expect(mocks.link).not.toHaveBeenCalled()
})
it('does not replace another association on retry', async () => {
  mocks.existing.mockReturnValue({ locationId: 'other' })
  await expect(linkDraftPlace(input)).rejects.toThrow('different place')
  expect(mocks.link).not.toHaveBeenCalled()
})
it('propagates import failure without attempting a link', async () => {
  mocks.candidate.mockResolvedValue({ status: 'source-import-needed' })
  mocks.import.mockRejectedValue(new Error('unavailable'))
  await expect(linkDraftPlace(input)).rejects.toThrow('unavailable')
  expect(mocks.link).not.toHaveBeenCalled()
})

it('reassociates only the explicitly selected previous identity and preserves the selected naming policy', async () => {
  mocks.existing.mockReturnValue({ locationId: 'previous', version: 'saved-version' })
  await linkDraftPlace({
    ...input,
    replacementLocationId: 'previous',
    nameMode: 'independent',
  })
  expect(mocks.relink).toHaveBeenCalledWith({
    featureId: input.featureId,
    locationId: ready.locationId,
    revisionId: ready.revisionId,
    expectedFeatureModifiedAt: input.modifiedAt,
    expectedRevision: 'saved-version',
    nameMode: 'independent',
  })
  mocks.existing.mockReturnValue({ locationId: 'concurrent', version: 'changed' })
  await expect(
    linkDraftPlace({ ...input, replacementLocationId: 'previous' }),
  ).rejects.toThrow('different')
})
