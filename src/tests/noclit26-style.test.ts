import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import {
  getMapStyleRenderAssetPath,
  resolveMapStyleRenderPathForKey,
} from '#lib/map/styles/render.shared.js'
import { buildMapStyle } from '#lib/map/styles/registry.js'
import {
  isProjectOnlyMapStyle,
  REGISTERED_MAP_STYLE_CATALOG,
} from '#lib/map/styles/catalog.js'

describe("NocLit'26", () => {
  it.each(['en', 'zhHant', 'zhHans'] as const)(
    'builds a valid quiet map in %s',
    locale => {
      const style = buildMapStyle('noclit26', { locale })
      expect(validateStyleMin(style)).toEqual([])
      expect(style.name).toBe("NocLit'26")
      expect(
        style.layers.some(
          layer => 'source-layer' in layer && layer['source-layer'] === 'pois',
        ),
      ).toBe(false)
      const noLabels = buildMapStyle('noclit26', { locale, noLabels: true })
      expect(validateStyleMin(noLabels)).toEqual([])
      expect(
        noLabels.layers.some(
          layer => layer.type === 'symbol' && layer.layout?.visibility !== 'none',
        ),
      ).toBe(false)
    },
  )
  it('uses flat red land and black streets without building or minor-label detail', () => {
    const style = buildMapStyle('noclit26')
    expect(style.layers).toHaveLength(10)
    expect(
      style.layers.some(layer => /buildings|places_|roads_labels_minor/.test(layer.id)),
    ).toBe(false)
    const paint = (id: string) => style.layers.find(layer => layer.id === id)?.paint
    expect(paint('earth')).toHaveProperty('fill-color', '#b93826')
    expect(paint('water')).toHaveProperty('fill-color', '#3b3b3b')
    expect(
      style.layers
        .filter(layer => layer.type === 'line')
        .every(layer => layer.paint?.['line-color'] === '#272727'),
    ).toBe(true)
  })
  it('uses its bundled picker thumbnail in every environment', async () => {
    expect(getMapStyleRenderAssetPath('noclit26')).toBe(
      '/mapStylePreviews/noclit26.png',
    )
    expect(await resolveMapStyleRenderPathForKey('production', 'noclit26')).toBe(
      '/mapStylePreviews/noclit26.png',
    )
  })
  it('is project-only and owned by eln', () => {
    expect(isProjectOnlyMapStyle('noclit26')).toBe(true)
    expect(
      REGISTERED_MAP_STYLE_CATALOG.find(entry => entry.key === 'noclit26')?.projectCode,
    ).toBe('eln')
    expect(isProjectOnlyMapStyle('hyper')).toBe(false)
  })
})
