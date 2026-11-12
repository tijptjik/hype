import { expect, test } from 'vitest'
import { breadlineBrand } from '#lib/features/breadlinePresentation.js'

const legacy = { properties: [{ property: { key: 'brand' }, value: 'maxims' }] }
test('only Location brands supply branding; the retired classifier is ignored', () => {
  expect(breadlineBrand(legacy).name).toBe('Breadline')
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

test('prefers the accepted catalogue logo over bundled brand artwork', () => {
  const logo = '/api/identity-catalogue/logos/abc-123'
  expect(
    breadlineBrand({
      locationBrands: [
        {
          identifiers: { breadlineBrand: 'kayser', catalogueVersion: '2' },
          names: { en: 'Maison Kayser' },
          logo,
        },
      ],
    }).logoSrc,
  ).toBe(logo)
})
