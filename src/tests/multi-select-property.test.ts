// @vitest-environment node
// TESTING
import { describe, expect, it } from 'vitest'
// PROPERTY CONTRACTS
import { validateFeaturePhoneProperties } from '#lib/db/services/feature-property-validation.js'
import { isCompatiblePropertyTransition } from '#lib/db/services/propertyContractTransition.js'
// TYPES
import type { Database } from '#lib/types.js'
// PROPERTY SELECTION
import {
  encodePropertySelection,
  selectedPropertyValueIds,
  isMultiSelectProperty,
} from '#lib/properties/selection.js'

const definition = {
  id: 'p',
  type: 'classifier',
  component: 'SelectField',
  dataType: 'text',
  cardinality: 'many',
  audience: 'public',
  isTranslatable: true,
  dateResolution: 'day',
  timeMaxHour: 24,
  values: [{ id: 'a' }, { id: 'b' }],
}
const db = {
  query: {
    property: { findMany: async () => [definition] },
    layerProperty: { findMany: async () => [{ propertyId: 'p' }] },
  },
} as unknown as Database

describe('multi-select classifiers', () => {
  it('retains legacy selections and canonically encodes new collections', () => {
    expect(selectedPropertyValueIds({ propertyValueId: 'a' })).toEqual(['a'])
    expect(encodePropertySelection(['b', 'a'])).toBe(
      '{"version":1,"propertyValueIds":["a","b"]}',
    )
    expect(encodePropertySelection([])).toBeNull()
    expect(() => encodePropertySelection(['a', 'a'])).toThrow()
    expect(() =>
      selectedPropertyValueIds({
        propertyValueId: 'a',
        valueJson: encodePropertySelection(['b']),
      }),
    ).toThrow()
    expect(isMultiSelectProperty(definition)).toBe(true)
    expect(isMultiSelectProperty({ ...definition, cardinality: 'one' })).toBe(false)
  })
  it('validates every selected option against the persisted field and layer', async () => {
    const valueJson = encodePropertySelection(['a', 'b'])
    expect(
      await validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'p', valueJson }],
        new Set(),
        'layer',
      ),
    ).toMatchObject([
      { propertyId: 'p', propertyValueId: null, value: null, valueJson },
    ])
    await expect(
      validateFeaturePhoneProperties(db, [
        { propertyId: 'p', valueJson: encodePropertySelection(['foreign']) },
      ]),
    ).rejects.toThrow('another field')
    await expect(
      validateFeaturePhoneProperties(db, [
        { propertyId: 'p', valueJson, value: 'scalar' },
      ]),
    ).rejects.toThrow()
    const unavailable = {
      query: {
        property: { findMany: async () => [definition] },
        layerProperty: { findMany: async () => [] },
      },
    } as unknown as Database
    await expect(
      validateFeaturePhoneProperties(
        unavailable,
        [{ propertyId: 'p', valueJson }],
        new Set(),
        'layer',
      ),
    ).rejects.toThrow('not assigned')
  })
  it('widens populated classifiers without rewriting singleton evidence', () => {
    expect(
      isCompatiblePropertyTransition(
        { ...definition, cardinality: 'one' },
        definition,
        [['feature', null, 'a', null, []]],
      ),
    ).toBe(true)
    expect(
      isCompatiblePropertyTransition(
        definition,
        { ...definition, cardinality: 'one' },
        [['feature', null, null, encodePropertySelection(['a', 'b']), []]],
      ),
    ).toBe(false)
  })
})

it('captures every selected label in revision history and rejects missing option context', async () => {
  const { featureRevisionSourceFixture } = await import(
    './fixtures/featureRevisionContent'
  )
  const { buildFeatureRevisionBaselineContent } = await import(
    '#lib/db/services/featureRevisionContent.js'
  )
  const { FeatureRevisionContentSchema } = await import(
    '#lib/revisions/featureContent.js'
  )
  const source = featureRevisionSourceFixture()
  const field = source.fieldDefinitions.find(row => row.id === 'choice')!
  field.component = 'SelectField'
  field.cardinality = 'many'
  source.fieldOptions.push({
    id: 'second',
    propertyId: 'choice',
    value: 'other',
    rank: 1,
  })
  source.fieldOptionTranslations.push({
    propertyValueId: 'second',
    locale: 'en',
    value: 'Other',
    valueGen: false,
  })
  const selection = source.properties.find(row => row.propertyId === 'choice')!
  selection.propertyValueId = null
  selection.valueJson = encodePropertySelection(['option', 'second'])
  const content = buildFeatureRevisionBaselineContent(source, {
    revisions: { photo: 'image-r1', research: 'private-r1' },
    order: ['photo', 'research'],
  })
  expect(
    content.properties.choice.selection.definition.selectedOptions?.map(
      option => option.translations.en.value,
    ),
  ).toEqual(['Shop', 'Other'])
  content.properties.choice.selection.definition.selectedOptions?.pop()
  expect(FeatureRevisionContentSchema.safeParse(content).success).toBe(false)
})
