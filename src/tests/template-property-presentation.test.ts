import { expect, it } from 'vitest'
import {
  describeTemplateProperty,
  templatePreviewValue,
} from '../lib/templates/propertyPresentation'

it('describes a property with its source and data type', () => {
  expect(describeTemplateProperty({ path: 'brand.name', label: 'brand.name' })).toEqual(
    { name: 'Brand', source: 'Linked location', type: 'text' },
  )
  expect(
    describeTemplateProperty({
      path: 'properties.open',
      label: 'Feature property · Open',
      test: 'boolean',
    }).type,
  ).toBe('boolean')
})
it('uses saved examples in the preview locale, otherwise generates a named sample', () => {
  const property = {
    path: 'properties.caption',
    label: 'Feature property · Caption',
    examples: { en: 'Saved caption' },
  }
  expect(templatePreviewValue(property, 'en')).toBe('Saved caption')
  expect(templatePreviewValue(property, 'zh-Hant')).toBe('Sample Caption')
  expect(templatePreviewValue({ path: 'brand.name', label: 'brand.name' })).toBe(
    'Sample Brand',
  )
  expect(
    templatePreviewValue({ path: 'properties.open', label: 'Open', test: 'boolean' }),
  ).toBe(true)
})
