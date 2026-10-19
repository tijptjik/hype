import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import {
  FEATURED_MAP_STYLE_KEYS,
  SELECTABLE_MAP_STYLE_CATALOG,
  isMapStyleSelectable,
} from '#lib/map/styles/catalog.js'
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
  for (const key of ['hyper', 'hyperLight', 'breadline-dark', 'midnight'] as const) {
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
  it.each(['hyper', 'hyperLight'] as const)('omits all POIs in %s', key => {
    const style = buildMapStyle(key)
    expect(
      style.layers.some(
        layer => 'source-layer' in layer && layer['source-layer'] === 'pois',
      ),
    ).toBe(false)
    expect(style.layers.some(layer => layer.id === 'streets')).toBe(true)
  })
  it.each(['hyper', 'hyperLight'] as const)(
    'uses the selected Etch composition for %s',
    key => {
      const style = buildMapStyle(key)
      expect(style.metadata).toHaveProperty('hype:style-variant', 'Etch')
      expect(
        style.layers.some(layer => layer.id === 'footprints' && layer.type === 'line'),
      ).toBe(true)
      expect(style.layers.find(layer => layer.id === 'streets')?.layout).toHaveProperty(
        'symbol-spacing',
        900,
      )
      expect(style.layers.some(layer => layer.id === 'blocks')).toBe(false)
    },
  )
  it.each(['hyper', 'hyperLight'] as const)(
    'reveals building detail at high zoom without enabling POIs in %s',
    key => {
      const style = buildMapStyle(key)
      expect(style.layers.find(layer => layer.id === 'building-names')?.minzoom).toBe(
        18,
      )
      expect(style.layers.find(layer => layer.id === 'building-numbers')?.minzoom).toBe(
        19,
      )
      expect(style.sources).toHaveProperty('building-labels')
      const unlabelled = buildMapStyle(key, { noLabels: true })
      expect(unlabelled.sources).not.toHaveProperty('building-labels')
      expect(unlabelled.layers.some(layer => layer.type === 'symbol')).toBe(false)
    },
  )
  it('retires the removed picker options while keeping their saved styles renderable', () => {
    for (const key of [
      'ghostery-legacy',
      'neonmaster',
      'genesis',
      'sin',
      'rosepunk',
      'breadline',
    ] as const) {
      expect(isMapStyleSelectable(key)).toBe(false)
      expect(SELECTABLE_MAP_STYLE_CATALOG.some(entry => entry.key === key)).toBe(false)
      expect(buildMapStyle(key).layers.length).toBeGreaterThan(0)
    }
    expect(isMapStyleSelectable('custom-organisation-map')).toBe(true)
  })
  it('preserves the SaanSeoi midnight palette', () => {
    const style = buildMapStyle('midnight')
    const water = style.layers.find(layer => layer.id === 'water')
    expect(water?.type === 'fill' && water.paint?.['fill-color']).toBe('#061426')
    expect(style.metadata).toHaveProperty('saanseoi:style')
  })
})
