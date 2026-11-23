// BUN
import { expect, test } from 'bun:test'
// ADDRESS
import { emptyFeatureAddress } from '../../src/lib/addresses/featureAddress'
import {
  assertProductionFeatureAddress,
  toProductionFeatureAddress,
} from './lib/production-address'

test('Place-era imports retain localized labels, coordinates and authored evidence', () => {
  const address = emptyFeatureAddress({ en: '10 Main Street', 'zh-hant': '大街10號' })
  address.coordinates = [114.1, 22.3]
  address.source.authored = {
    scope: 'unknown',
    i18n: { en: { formattedAddress: '10 Main Street' } },
    unit: null,
    unitI18n: {},
  }
  address.legacy = { retained: 'existing evidence' }
  const original = structuredClone(address)
  const result = toProductionFeatureAddress(address)
  expect(result.source).toEqual({
    status: 'unresolved',
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    addressSnapshotId: null,
    records: {},
    fallbackDisplay: original.source.fallbackDisplay,
  })
  expect(result.coordinates).toEqual(original.coordinates)
  expect(result.legacy).toEqual({
    retained: 'existing evidence',
    breadlineLocationAddressSource: original.source,
  })
  expect(address).toEqual(original)
  expect(() =>
    assertProductionFeatureAddress(JSON.stringify({ address: result })),
  ).not.toThrow()
  expect(() =>
    assertProductionFeatureAddress(JSON.stringify({ address: original })),
  ).toThrow('regenerate the import plan')
})

test('production import refuses to reinterpret pinned address evidence', () => {
  const address = emptyFeatureAddress({ en: '10 Main Street' })
  address.source.snapshotId = 'source-publication'
  expect(() => toProductionFeatureAddress(address)).toThrow('without source identity')
  address.source.snapshotId = null
  address.source.rawSource = { retained: 'source record' }
  expect(() => toProductionFeatureAddress(address)).toThrow('without source identity')
})

test('stale Feature plans fail before invoking the database', async () => {
  const { applyFeatureSyncGroup } = await import('./lib/feature-sync-plan')
  let invoked = false
  const db = {
    prepare: () => {
      invoked = true
      throw new Error('Unexpected write')
    },
    batch: async () => {
      invoked = true
      throw new Error('Unexpected write')
    },
  }
  await expect(
    applyFeatureSyncGroup(db as never, {
      identity: 'donors:1',
      mutations: [
        {
          table: 'feature',
          key: { id: 'f' },
          before: null,
          after: {
            id: 'f',
            addressMeta: JSON.stringify({
              address: emptyFeatureAddress({ en: 'Address' }),
            }),
          },
        },
      ],
    }),
  ).rejects.toThrow('regenerate the import plan')
  expect(invoked).toBe(false)
})
