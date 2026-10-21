import { expect, test } from 'vitest'
import { materializeLocationReset, LocationResetSchema } from '#lib/locations/reset.js'
import { FeatureEntityFormData } from '#lib/db/zod/schema/feature.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const facts = {
  names: { en: 'Source', 'zh-hant': '來源' },
  phoneNumber: ['+85223456789'],
  brands: [],
  location: {
    geometry: { type: 'Point', coordinates: [114.2, 22.3] },
    address: emptyFeatureAddress({ en: 'Source address' }).source,
  },
}
const input = {
  reset: LocationResetSchema.parse({ expectedRevision: 'accepted', names: ['en'] }),
  facts,
  locationFacts: facts,
  overrides: {
    names: {
      en: { mode: 'override' as const, value: 'Local' },
      'zh-hant': { mode: 'clear' as const },
    },
    phoneNumber: { mode: 'clear' as const },
  },
  data: { isVisitable: true },
  i18n: {
    en: {
      title: 'Local',
      description: 'Instructions',
      displayAddress: 'Local address',
    },
    zhHant: { title: '本地' },
  },
}

test('a name reset changes only the requested name and preserves other overrides', () => {
  const result = materializeLocationReset(input)
  expect(result.i18n).toEqual({
    en: {
      title: 'Source',
      titleGen: false,
      description: 'Instructions',
      displayAddress: 'Local address',
    },
    zhHant: { title: '本地' },
  })
  expect(result.overrides.names?.['zh-hant']).toEqual({ mode: 'clear' })
  expect(result.overrides.phoneNumber).toEqual({ mode: 'clear' })
  expect(result.data).toEqual(input.data)
  expect(result.phoneNumber).toBeUndefined()
  expect(input.i18n.en.title).toBe('Local')
})

test('reset rejects missing source names and unresolved canonical address dependencies', () => {
  expect(() =>
    materializeLocationReset({
      ...input,
      reset: { ...input.reset, names: ['zhHans'] },
    }),
  ).toThrow('no valid name')
  expect(() =>
    materializeLocationReset({
      ...input,
      reset: { ...input.reset, names: [], location: true },
      locationFacts: {
        ...facts,
        location: {
          ...facts.location,
          address: { ...facts.location.address, address2dId: 'missing-record' },
        },
      },
    }),
  ).toThrow()
})

test('reset form envelope preserves explicit targets and rejects empty or caller-provided source data', () => {
  const value = {
    expectedRevision: 'accepted',
    names: [],
    phoneNumber: true,
    location: false,
  }
  expect(
    FeatureEntityFormData.shape.locationReset.parse(JSON.stringify(value)),
  ).toEqual(value)
  expect(LocationResetSchema.safeParse({ expectedRevision: 'accepted' }).success).toBe(
    false,
  )
  expect(LocationResetSchema.safeParse({ ...value, facts }).success).toBe(false)
  expect(
    LocationResetSchema.safeParse({ ...value, names: ['unsupported'] }).success,
  ).toBe(false)
})
