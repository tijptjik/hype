import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { FEATURED_MAP_STYLE_KEYS } from '#lib/map/styles/catalog.js'
import { buildMapStyle } from '#lib/map/styles/registry.js'

describe('featured map styles', () => {
  it('presents the six requested choices in order', () => {
    expect(FEATURED_MAP_STYLE_KEYS).toEqual([
      'hyper',
      'hyperLight',
      'breadline-light',
      'breadline-dark',
      'hyperpop',
      'midnight',
    ])
  })
  for (const key of ['breadline-dark', 'midnight'] as const) {
    it(`builds valid ${key} styles with and without labels`, () => {
      expect(validateStyleMin(buildMapStyle(key))).toEqual([])
      const unlabelled = buildMapStyle(key, { noLabels: true })
      expect(validateStyleMin(unlabelled)).toEqual([])
      expect(
        unlabelled.layers.some(
          layer => layer.type === 'symbol' && layer.layout?.visibility !== 'none',
        ),
      ).toBe(false)
    })
  }
  it('preserves the SaanSeoi midnight palette', () => {
    const style = buildMapStyle('midnight')
    const water = style.layers.find(layer => layer.id === 'water')
    expect(water?.type === 'fill' && water.paint?.['fill-color']).toBe('#061426')
    expect(style.metadata).toHaveProperty('saanseoi:style')
  })
})
