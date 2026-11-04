// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import {
  linkDraftLocalLocation,
  type DraftLocalLocationIntent,
} from '#lib/locations/linkDraftLocalLocation.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
const mocks = vi.hoisted(() => ({
  existing: vi.fn(),
  create: vi.fn(),
  link: vi.fn(),
  building: vi.fn(),
  relink: vi.fn(),
}))
vi.mock('#lib/api/buildingLocation.remote.js', () => ({
  importBuildingLocation: mocks.building,
}))
vi.mock('#lib/api/location.remote.js', () => ({
  getFeatureLocation: () =>
    Object.assign(Promise.resolve(mocks.existing()), { refresh: async () => {} }),
  createLocalLocation: mocks.create,
  linkFeatureLocation: mocks.link,
  relinkFeatureLocation: mocks.relink,
}))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.existing.mockReturnValue(null)
  mocks.create.mockResolvedValue({ locationId: 'local', revisionId: 'revision' })
})
it('retains the created identity before linking and reuses it after a failed link', async () => {
  const address = emptyFeatureAddress()
  address.coordinates = [114, 22]
  let intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    input: localIdentityFromAddress('establishment', { en: 'Bakery' }, address),
  }
  mocks.link.mockRejectedValueOnce(new Error('network'))
  const retain = (value: DraftLocalLocationIntent) => {
    intent = value
  }
  await expect(linkDraftLocalLocation(intent, 'timestamp', retain)).rejects.toThrow(
    'network',
  )
  expect(intent.identity?.locationId).toBe('local')
  await linkDraftLocalLocation(intent, 'timestamp', retain)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.link).toHaveBeenLastCalledWith(
    expect.objectContaining({ locationId: 'local', nameMode: 'inherit' }),
  )
  mocks.existing.mockReturnValue({ locationId: 'local' })
  await linkDraftLocalLocation(intent, 'timestamp', retain)
  expect(mocks.link).toHaveBeenCalledTimes(2)
  mocks.existing.mockReturnValue({ locationId: 'different' })
  await expect(linkDraftLocalLocation(intent, 'timestamp', retain)).rejects.toThrow(
    'different',
  )
  expect(mocks.create).toHaveBeenCalledTimes(1)
})

it('keeps an independent Feature name when linking a selected building', async () => {
  const address = emptyFeatureAddress()
  address.coordinates = [114, 22]
  const intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    nameMode: 'independent',
    input: localIdentityFromAddress('building', { en: 'Example Tower' }, address),
  }
  await linkDraftLocalLocation(intent, 'timestamp', () => {})
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'building',
      facts: expect.objectContaining({ names: { en: 'Example Tower' } }),
    }),
  )
  expect(mocks.link).toHaveBeenCalledWith(
    expect.objectContaining({ nameMode: 'independent' }),
  )
})

it('links an address-only Location independently and reuses its identity after a failed association', async () => {
  const address = emptyFeatureAddress({ en: '35 Hollywood Road' })
  address.coordinates = [114, 22]
  address.source.address2dId = 'canonical-address'
  let intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    nameMode: 'independent',
    input: localIdentityFromAddress('address', {}, address),
  }
  mocks.link.mockRejectedValueOnce(new Error('offline'))
  const retain = (value: DraftLocalLocationIntent) => {
    intent = value
  }
  await expect(linkDraftLocalLocation(intent, 'timestamp', retain)).rejects.toThrow(
    'offline',
  )
  await linkDraftLocalLocation(intent, 'timestamp', retain)
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      kind: 'address',
      facts: expect.objectContaining({
        names: expect.objectContaining({ en: '35 Hollywood Road' }),
      }),
    }),
  )
  expect(mocks.building).not.toHaveBeenCalled()
  expect(mocks.link).toHaveBeenLastCalledWith(
    expect.objectContaining({
      locationId: 'local',
      revisionId: 'revision',
      nameMode: 'independent',
    }),
  )
  expect(address.source.address2dId).toBe('canonical-address')
})

it('imports the selected catalogue building and retains it for retry instead of creating a manual identity', async () => {
  mocks.building.mockResolvedValue({
    locationId: 'known-building',
    revisionId: 'baseline',
  })
  const address = emptyFeatureAddress()
  address.coordinates = [114, 22]
  let intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    buildingSource: { id: 'gers', release: 'r1', addressId: 'a1' },
    input: localIdentityFromAddress('building', { en: 'Known Building' }, address),
  }
  mocks.link.mockRejectedValueOnce(new Error('offline'))
  await expect(
    linkDraftLocalLocation(intent, 'timestamp', value => {
      intent = value
    }),
  ).rejects.toThrow('offline')
  await linkDraftLocalLocation(intent, 'timestamp', () => {})
  expect(mocks.building).toHaveBeenCalledExactlyOnceWith({
    projectId: 'project',
    source: intent.buildingSource,
    visibility: 'shared',
    names: { en: 'Known Building' },
  })
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.link).toHaveBeenLastCalledWith(
    expect.objectContaining({ locationId: 'known-building', revisionId: 'baseline' }),
  )
})

it('links an already resolved address Location without creating a duplicate', async () => {
  const address = emptyFeatureAddress({ en: '242-244 Hollywood Road' })
  address.coordinates = [114, 22]
  const intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    input: localIdentityFromAddress('address', {}, address),
    identity: { locationId: 'known', revisionId: 'r1' },
    nameMode: 'independent',
  }
  await linkDraftLocalLocation(intent, 'timestamp', () => {})
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.link).toHaveBeenCalledWith(
    expect.objectContaining({ locationId: 'known', revisionId: 'r1' }),
  )
})

it('relinks an existing nameless identity without creation input and fences retries', async () => {
  mocks.existing.mockReturnValue({ locationId: 'old', version: 'after-save' })
  let intent: DraftLocalLocationIntent = {
    featureId: 'feature',
    projectId: 'project',
    identity: { locationId: 'new', revisionId: 'r2' },
    nameMode: 'independent',
    replacementLocationId: 'old',
  }
  mocks.relink.mockRejectedValueOnce(new Error('offline'))
  await expect(
    linkDraftLocalLocation(intent, 'saved', value => {
      intent = value
    }),
  ).rejects.toThrow('offline')
  expect(intent.replacementRevision).toBe('after-save')
  await linkDraftLocalLocation(intent, 'saved', () => {})
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.relink).toHaveBeenLastCalledWith({
    featureId: 'feature',
    locationId: 'new',
    revisionId: 'r2',
    expectedFeatureModifiedAt: 'saved',
    expectedRevision: 'after-save',
    nameMode: 'independent',
  })
  mocks.existing.mockReturnValue({ locationId: 'other', version: 'concurrent' })
  await expect(linkDraftLocalLocation(intent, 'saved', () => {})).rejects.toThrow(
    'different',
  )
  mocks.existing.mockReturnValue({ locationId: 'new', version: 'done' })
  await linkDraftLocalLocation(intent, 'saved', () => {})
  expect(mocks.relink).toHaveBeenCalledTimes(2)
})
