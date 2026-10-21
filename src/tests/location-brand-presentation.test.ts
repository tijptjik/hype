import { expect, test } from 'vitest'
import { breadlineBrand } from '#lib/features/breadlinePresentation.js'

const legacy = { properties: [{ property: { key: 'brand' }, value: 'maxims' }] }
test('linked brands take precedence, while clear and empty arrays suppress legacy fallback', () => {
  expect(breadlineBrand(legacy).logoSrc).toBeTruthy()
  expect(breadlineBrand({ ...legacy, locationBrands: [] }).name).toBe('Breadline')
  const result = breadlineBrand(
    {
      ...legacy,
      locationBrands: [
        {
          identifiers: { breadlineBrand: 'kayser' },
          names: { en: 'Maison Kayser', 'zh-hant': '品牌名稱' },
        },
      ],
    },
    'zh-hant',
  )
  expect(result.name).toBe('品牌名稱')
  expect(result.logoSrc).toContain('kayser.svg')
})
test('all brand names are retained and multiple brands do not arbitrarily choose one logo', () => {
  const result = breadlineBrand({
    locationBrands: [
      { identifiers: { breadlineBrand: 'kayser' }, names: { en: 'Maison Kayser' } },
      { identifiers: {}, names: { en: 'Second brand' } },
    ],
  })
  expect(result.name).toBe('Maison Kayser · Second brand')
  expect(result.logoSrc).toBeUndefined()
})
