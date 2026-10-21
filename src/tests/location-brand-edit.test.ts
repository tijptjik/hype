import { expect, test } from 'vitest'
import { FeatureEntityFormData } from '#lib/db/zod/schema/feature.js'

const schema = FeatureEntityFormData.shape.locationBrandEdit

test('brand form JSON preserves identifiers, all locales and explicit empty arrays', () => {
  for (const choice of [
    { mode: 'inherit' },
    { mode: 'clear' },
    { mode: 'override', value: [] },
    {
      mode: 'override',
      value: [
        { identifiers: { source: 'brand-1' }, names: { en: 'Brand', fr: 'Marque' } },
      ],
    },
  ]) {
    const value = { expectedRevision: 'accepted', choice }
    expect(schema.parse(JSON.stringify(value))).toEqual(value)
  }
  expect(schema.parse(undefined)).toBeUndefined()
})

test('malformed brand edits never turn into inheritance or an empty replacement', () => {
  for (const value of [
    '{',
    '',
    '{}',
    { expectedRevision: '', choice: { mode: 'inherit' } },
    { expectedRevision: 'accepted', choice: { mode: 'override' } },
    { expectedRevision: 'accepted', choice: { mode: 'override', value: 'Brand' } },
  ]) {
    expect(schema.safeParse(value).success).toBe(false)
  }
})
