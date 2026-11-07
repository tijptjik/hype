// VITEST
import { describe, expect, it } from 'vitest'
// NODE
import { readFileSync } from 'node:fs'
// MAPLIBRE
import { featureFilter, validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
// MAP
import {
  FEATURED_MAP_STYLE_KEYS,
  SELECTABLE_MAP_STYLE_CATALOG,
  isProjectOnlyMapStyle,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogCopy } from '#lib/map/styles/i18n.js'
import { buildMapStyle } from '#lib/map/styles/registry.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
// THEMES
import { THEME_MAP_STYLES } from '#lib/themes/themes.js'

describe('Quercus', () => {
  it('offers a global light style with a bundled preview alongside Milque maps', () => {
    expect(
      SELECTABLE_MAP_STYLE_CATALOG.find(entry => entry.key === 'quercus'),
    ).toMatchObject({ name: 'Quercus', markerTheme: 'light', basemapVariant: 'light' })
    expect(FEATURED_MAP_STYLE_KEYS).toContain('quercus')
    expect(isProjectOnlyMapStyle('quercus')).toBe(false)
    expect(getMapStyleRenderAssetPath('quercus')).toBe('/mapStylePreviews/quercus.png')
    expect(THEME_MAP_STYLES['breadline-light']).toBe('breadline-light')
  })

  it.each(['en', 'zhHant', 'zhHans'] as const)(
    'builds valid localized and label-free styles in %s',
    locale => {
      const style = buildMapStyle('quercus', { locale })
      expect(validateStyleMin(style)).toEqual([])
      expect(style.layers.some(layer => layer.type === 'symbol')).toBe(true)
      expect(getMapStyleCatalogCopy('quercus', locale).name).toBe('Quercus')
      expect(getMapStyleCatalogCopy('quercus', locale).description).toBeTruthy()

      const unlabelled = buildMapStyle('quercus', { locale, noLabels: true })
      expect(validateStyleMin(unlabelled)).toEqual([])
      expect(unlabelled.layers.some(layer => layer.type === 'symbol')).toBe(false)
      expect(
        unlabelled.layers.some(
          layer => layer.type === 'fill' && layer.paint?.['fill-pattern'],
        ),
      ).toBe(true)
    },
  )

  it('reserves POI detail for project trees while preserving walking context', () => {
    const style = buildMapStyle('quercus')
    expect(
      style.layers.some(
        layer => 'source-layer' in layer && layer['source-layer'] === 'pois',
      ),
    ).toBe(false)
    expect(style.layers.some(layer => layer.id.startsWith('boundaries'))).toBe(false)
    for (const id of [
      'earth',
      'water',
      'landuse_park',
      'buildings',
      'roads_other',
      'roads_labels_major',
    ]) {
      expect(style.layers.some(layer => layer.id === id)).toBe(true)
    }
    expect(Object.keys(style.sources)).toEqual(['hongkong-latest'])
  })

  it('excludes motorway surfaces, ramps and labels while retaining local walking context', () => {
    const style = buildMapStyle('quercus')
    const roadLayers = style.layers.filter(
      layer => 'source-layer' in layer && layer['source-layer'] === 'roads',
    )
    expect(roadLayers.length).toBeGreaterThan(0)
    expect(
      style.layers.some(layer =>
        /_highway|_link|_casing|roads_shields|roads_oneway/.test(layer.id),
      ),
    ).toBe(false)
    for (const layer of roadLayers) {
      if (!('filter' in layer)) throw new Error(`Missing road filter: ${layer.id}`)
      const accepts = featureFilter(layer.filter, layer.id).filter
      for (const properties of [
        { kind: 'highway' },
        { kind: 'highway', is_bridge: true },
        { kind: 'highway', is_tunnel: true },
        { kind: 'major_road', is_link: true },
        { kind: 'major_road', kind_detail: 'trunk' },
        { kind: 'minor_road', kind_detail: 'motorway_link' },
      ]) {
        expect(accepts({ zoom: 17 }, { type: 2, properties }), layer.id).toBe(false)
      }
    }
    for (const [id, properties] of [
      ['roads_minor', { kind: 'minor_road' }],
      ['roads_major', { kind: 'major_road' }],
      ['roads_other', { kind: 'path', kind_detail: 'footway' }],
      ['roads_bridges_other', { kind: 'path', is_bridge: true }],
      ['roads_tunnels_minor', { kind: 'minor_road', is_tunnel: true }],
      ['roads_labels_major', { kind: 'major_road' }],
    ] as const) {
      const layer = roadLayers.find(layer => layer.id === id)
      if (!layer || !('filter' in layer))
        throw new Error(`Missing local context: ${id}`)
      expect(
        featureFilter(layer.filter, id).filter({ zoom: 17 }, { type: 2, properties }),
        id,
      ).toBe(true)
    }
    expect(
      buildMapStyle('breadline-light').layers.some(
        layer => layer.id === 'roads_highway',
      ),
    ).toBe(true)
  })

  it('ships complete repeating paper, park and woodland textures at both pixel densities', () => {
    for (const [suffix, ratio] of [
      ['', 1],
      ['@2x', 2],
    ] as const) {
      const atlas = JSON.parse(
        readFileSync(`static/mapSprites/quercus/texture${suffix}.json`, 'utf8'),
      )
      const png = readFileSync(`static/mapSprites/quercus/texture${suffix}.png`)
      expect(Object.keys(atlas)).toEqual(['paper', 'park', 'wood'])
      expect(png.readUInt32BE(16)).toBe(384 * ratio)
      expect(png.readUInt32BE(20)).toBe(128 * ratio)
      for (const entry of Object.values(atlas) as Array<{
        width: number
        height: number
        pixelRatio: number
      }>) {
        expect(entry.pixelRatio).toBe(ratio)
        expect(entry.width / ratio).toBe(128)
        expect(entry.height / ratio).toBe(128)
      }
    }
    expect(buildMapStyle('quercus').sprite).toContainEqual({
      id: 'quercus',
      url: '/mapSprites/quercus/texture',
    })
  })

  it('keeps builds independent when callers alter layer paint', () => {
    const first = buildMapStyle('quercus')
    const earth = first.layers.find(layer => layer.id === 'earth')
    if (earth?.type !== 'fill') throw new Error('Missing land layer')
    earth.paint = { ...earth.paint, 'fill-color': '#000000' }
    const second = buildMapStyle('quercus').layers.find(layer => layer.id === 'earth')
    expect(second?.type === 'fill' && second.paint?.['fill-color']).not.toBe('#000000')
  })
})
