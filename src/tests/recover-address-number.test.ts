// @vitest-environment node
import { expect, it } from 'vitest'
import { emptyFeatureAddress, getAddressLocale } from '#lib/addresses/featureAddress.js'
import { recoverAddressNumber } from '#lib/addresses/recoverAddressNumber.js'

const record = (label = 'PRETTY GARDEN, 75, KO PO TSUEN, KAM TIN, NT') => {
  const address = emptyFeatureAddress()
  address.coordinates = [114.0562, 22.44183]
  address.source.rawSource = {
    data: {
      attributes: {
        hamletId: 'ko-po',
        sources: [{ publisher: 'hkgov-dpo' }],
        i18n: {
          en: {
            formattedAddress: label,
            premisesName: 'PRETTY GARDEN',
            buildingNumberExpression: null,
            streetName: null,
          },
        },
      },
    },
  }
  return address
}
it('recovers the selected village number while retaining source evidence, locality and pin', () => {
  const address = record()
  const next = recoverAddressNumber(address)
  expect(getAddressLocale(next, 'en').buildingNumberExpression).toBe('75')
  expect(getAddressLocale(next, 'en').streetName).toBeNull()
  expect(next.coordinates).toEqual(address.coordinates)
  expect(next.source).toEqual(address.source)
  expect(address.overrides).toEqual({})
})
it('rejects ambiguous tokens, unit labels and non-DPO sources', () => {
  for (const label of [
    'PRETTY GARDEN, 75, 76, KO PO TSUEN',
    'FLAT 75, PRETTY GARDEN, KO PO TSUEN',
  ]) {
    const address = record(label)
    expect(recoverAddressNumber(address)).toBe(address)
  }
  const address = record()
  address.source.rawSource = {
    data: {
      attributes: {
        hamletId: 'ko-po',
        sources: [{ publisher: 'other' }],
        i18n: { en: { formattedAddress: '75, KO PO TSUEN' } },
      },
    },
  }
  expect(recoverAddressNumber(address)).toBe(address)
})
it('preserves manual numbers and explicit clearing', () => {
  for (const value of ['71', null]) {
    const address = record()
    address.overrides.en = { buildingNumberExpression: value }
    expect(recoverAddressNumber(address)).toBe(address)
  }
})

it('recognises the hydrated detail endpoint village relationship', () => {
  const address = record()
  const data = address.source.rawSource.data as {
    attributes: Record<string, unknown>
    relationships?: unknown
  }
  delete data.attributes.hamletId
  data.relationships = {
    divisions: { data: [{ type: 'divisions', id: 'ko-po', meta: { role: 'hamlet' } }] },
  }
  expect(
    getAddressLocale(recoverAddressNumber(address), 'en').buildingNumberExpression,
  ).toBe('75')
})

it('makes the initial Pretty Garden group expose its numeric alternatives', async () => {
  const { groupDraftSearchResults } = await import(
    '#lib/locations/draftSearchGroups.js'
  )
  const rows = ['75', '73', '72', '74', '71'].map(number => ({
    id: number,
    kind: 'address' as const,
    names: { en: 'Pretty Garden' },
    address: recoverAddressNumber(record(`PRETTY GARDEN, ${number}, KO PO TSUEN, NT`)),
  }))
  const [group] = groupDraftSearchResults(rows)
  expect(group.numberRange).toBe('71-75')
  expect(group.members.map(row => row.id)).toEqual(['71', '72', '73', '74', '75'])
})
