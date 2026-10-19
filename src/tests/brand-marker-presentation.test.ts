// @vitest-environment jsdom
// TESTING
import { describe, expect, it } from 'vitest'
// PRESENTATION
import { BRAND_IDENTITIES, resolveBrandIdentity } from '#lib/features/brandIdentity.js'
import {
  customMarkerModel,
  customMarkerSignature,
  createCustomMarkerElement,
} from '#lib/map/customMarkers.js'

const feature = {
  properties: [
    { property: { key: 'country' }, propertyValue: { value: 'Belgium & Slovenia' } },
    {
      property: { key: 'brand' },
      propertyValue: { i18n: { en: { value: "Maxim's" } } },
    },
  ],
}

describe('effective brand property contract', () => {
  it('renders all fourteen identities from an inherited or direct property without a Place dependency', () => {
    for (const brand of BRAND_IDENTITIES) {
      const direct = customMarkerModel('breadline', {
        feature: { properties: [{ property: { key: 'brand' }, value: brand.code }] },
        imageSrc: '/never-use.jpg',
      })!
      const inherited = customMarkerModel('breadline', {
        feature: {
          properties: [
            { property: { key: 'brand' }, propertyValue: { value: brand.code } },
          ],
        },
        imageSrc: null,
      })!
      expect(customMarkerSignature(direct)).toBe(customMarkerSignature(inherited))
      expect(
        createCustomMarkerElement(direct).querySelector('img')?.getAttribute('src'),
      ).toBe(`/brands/breadline/${brand.code}.svg`)
    }
  })
  it('does not infer brand from a title or an arbitrary URL and retains a text fallback on asset failure', () => {
    expect(resolveBrandIdentity('https://evil.example/logo.svg')).toBeUndefined()
    expect(resolveBrandIdentity('Independent')).toBeUndefined()
    const unknown = customMarkerModel('breadline', {
      feature: { properties: [{ property: { key: 'brand' }, value: 'Independent' }] },
      imageSrc: null,
    })!
    expect(createCustomMarkerElement(unknown).querySelector('img')).toBeNull()
    const known = customMarkerModel('breadline', { feature, imageSrc: null })!
    expect(customMarkerSignature(known)).not.toBe(customMarkerSignature(unknown))
    const element = createCustomMarkerElement(known)
    element.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(element.querySelector('img')).toBeNull()
    expect(element.textContent).toBe('美心')
  })
})
