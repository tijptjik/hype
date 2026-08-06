import { describe, expect, it } from 'vitest'

import { getUserMarkerStyleVariant } from '$lib/map/markers'
import {
  buildCatalogMapStyle,
  buildMapStyle,
  getDefaultMapStyleKey,
  listMapStyleCatalog,
} from '$lib/map/styles'
import { getMapStyleRenderAssetPath } from '$lib/map/styles/render.shared'

describe('map styles', () => {
  it('defaults to the Ghostery style', () => {
    expect(getDefaultMapStyleKey()).toBe('ghostery')
  })

  it('loads the Hong Kong basemap from the SaanSeoi tile service', () => {
    const style = buildMapStyle('ghostery') as {
      sources?: Record<string, { url?: string }>
    }

    expect(style.sources?.['hongkong-latest']?.url).toBe(
      'https://tiles.saanseoi.hk/hongkong-latest.json',
    )
  })

  it('matches each map background to its primary water colour', () => {
    for (const { key } of listMapStyleCatalog()) {
      const style = buildCatalogMapStyle(key) as {
        layers?: Array<{ id?: string; paint?: Record<string, unknown> }>
      }
      const backgroundLayer = style.layers?.find(layer => layer.id === 'background')
      const waterLayer = style.layers?.find(layer => layer.id === 'water')

      expect(backgroundLayer?.paint?.['background-color']).toBe(
        waterLayer?.paint?.['fill-color'],
      )
    }
  })

  it('uses the stage-aware asset route for map-style previews', () => {
    expect(getMapStyleRenderAssetPath('rosepunk')).toBe(
      '/api/mapRenders/styles/rosepunk/asset',
    )
  })

  it('adds the Protomaps sprite to the admin map style', () => {
    const style = buildCatalogMapStyle('hyperAdmin') as { sprite?: string }

    expect(style.sprite).toBe(
      'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    )
  })

  it('defaults markers to image style and accepts dot override', () => {
    expect(getUserMarkerStyleVariant(null)).toBe('image')
    expect(getUserMarkerStyleVariant('anything-else')).toBe('image')
    expect(getUserMarkerStyleVariant('dot')).toBe('dot')
  })

  it('assigns a marker theme to every map style', () => {
    expect(listMapStyleCatalog().every(style => Boolean(style.markerTheme))).toBe(true)
    expect(
      listMapStyleCatalog().find(style => style.key === 'hyperpop')?.markerTheme,
    ).toBe('hyperpop')
  })

  it('hides symbol layers when labels are disabled', () => {
    const style = buildMapStyle('hyper', { noLabels: true }) as {
      layers?: Array<{ type?: string; layout?: Record<string, unknown> }>
    }

    const symbolLayer = style.layers?.find(layer => layer.type === 'symbol')

    expect(symbolLayer).toBeUndefined()
  })

  it('spaces repeated street names farther apart across Protomaps-derived styles', () => {
    const styleKeys = [
      'hyper',
      'hyperLight',
      'hyperpop',
      'ghostery',
      'neonmaster',
      'neorange',
      'genesis',
      'sin',
      'rosepunk',
      'breadline',
      'protomaps-dark',
      'ghostery-legacy',
    ] as const

    for (const key of styleKeys) {
      const style = buildMapStyle(key) as {
        layers?: Array<{
          id?: string
          filter?: unknown[]
          layout?: Record<string, unknown>
        }>
      }
      const majorRoadLabels = style.layers?.find(
        layer => layer.id === 'roads_labels_major',
      )
      const minorRoadLabels = style.layers?.find(
        layer => layer.id === 'roads_labels_minor',
      )

      expect(minorRoadLabels?.filter).toEqual(['in', 'kind', 'minor_road', 'other'])

      if (key === 'ghostery-legacy') {
        expect(majorRoadLabels?.layout?.['symbol-spacing']).toEqual([
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          750,
          16,
          750,
          20,
          750,
        ])
        expect(minorRoadLabels?.layout?.['symbol-spacing']).toEqual([
          'interpolate',
          ['linear'],
          ['zoom'],
          16,
          750,
          18,
          750,
          20,
          750,
        ])
        continue
      }

      expect(majorRoadLabels?.layout?.['symbol-spacing']).toBe(750)
      expect(minorRoadLabels?.layout?.['symbol-spacing']).toBe(750)
    }
  })

  it('returns a fresh clone for each request', () => {
    const firstStyle = buildMapStyle('ghostery-legacy') as {
      layers?: Array<{ layout?: Record<string, unknown> }>
    }
    const secondStyle = buildMapStyle('ghostery-legacy') as {
      layers?: Array<{ layout?: Record<string, unknown> }>
    }

    if (firstStyle.layers?.[0]) {
      firstStyle.layers[0].layout = { visibility: 'none' }
    }

    expect(secondStyle.layers?.[0]?.layout?.visibility).not.toBe('none')
  })

  it('matches the previous app map default road styling', () => {
    const style = buildMapStyle('ghostery-legacy') as {
      layers?: Array<{ id?: string; paint?: Record<string, unknown> }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads')

    expect(roadsLayer?.paint?.['line-color']).toBe('#4987E2')
  })

  it('keeps the ghostery roads on the Ghostery blue', () => {
    const style = buildMapStyle('ghostery') as {
      layers?: Array<{
        id?: string
        paint?: Record<string, unknown>
        minzoom?: number
        layout?: Record<string, unknown>
      }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const pathsLayer = style.layers?.find(layer => layer.id === 'roads_other')

    expect(roadsLayer?.paint?.['line-color']).toBe('#4987E2')
    expect(roadsLayer?.paint?.['line-blur']).toBe(0.55)
    expect(pathsLayer?.paint?.['line-opacity']).toBe(0.58)
    expect(pathsLayer?.minzoom).toBe(17)
  })

  it('switches neonmaster roads to red neon and building outlines to white glow', () => {
    const style = buildMapStyle('neonmaster') as {
      layers?: Array<{
        id?: string
        paint?: Record<string, unknown>
      }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const casingLayer = style.layers?.find(
      layer => layer.id === 'roads_major_casing_late',
    )
    const glowLabelLayer = style.layers?.find(
      layer => layer.id === 'roads_labels_major__glow',
    )
    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )

    expect(roadsLayer?.paint?.['line-color']).toBe('#FF355E')
    expect(casingLayer?.paint?.['line-color']).toBe('#FF7A8F')
    expect(glowLabelLayer?.paint?.['text-halo-color']).toBe('rgb(255, 74, 110)')
    expect(buildingOutline?.paint?.['line-color']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      17,
      'rgba(255, 255, 255, 0.12)',
      19,
      'rgba(255, 255, 255, 0.72)',
      20,
      'rgba(255, 255, 255, 1)',
    ])
  })

  it('gives neorange orange roads and cyan building outlines', () => {
    const style = buildMapStyle('neorange') as {
      layers?: Array<{
        id?: string
        paint?: Record<string, unknown>
      }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const casingLayer = style.layers?.find(
      layer => layer.id === 'roads_major_casing_late',
    )
    const glowLabelLayer = style.layers?.find(
      layer => layer.id === 'roads_labels_major__glow',
    )
    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )

    expect(roadsLayer?.paint?.['line-color']).toBe('#FF8A00')
    expect(casingLayer?.paint?.['line-color']).toBe('#FFB347')
    expect(glowLabelLayer?.paint?.['text-halo-color']).toBe('rgb(255, 164, 72)')
    expect(buildingOutline?.paint?.['line-color']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      17,
      'rgba(56, 247, 255, 0.14)',
      19,
      'rgba(56, 247, 255, 0.74)',
      20,
      'rgba(56, 247, 255, 1)',
    ])
  })

  it('uses the Rosé Punk palette for roads, water, and building outlines', () => {
    const style = buildMapStyle('rosepunk') as {
      name?: string
      layers?: Array<{
        id?: string
        paint?: Record<string, unknown>
      }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const highwayLayer = style.layers?.find(layer => layer.id === 'roads_highway')
    const waterLayer = style.layers?.find(layer => layer.id === 'water')
    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )

    expect(style.name).toBe('Rosé Punk')
    expect(roadsLayer?.paint?.['line-color']).toBe('#EB6F92')
    expect(highwayLayer?.paint?.['line-color']).toBe('#F6C177')
    expect(waterLayer?.paint?.['fill-color']).toBe('#31748F')
    expect(buildingOutline?.paint?.['line-color']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      16.5,
      'rgba(156, 207, 216, 0.1)',
      18,
      'rgba(156, 207, 216, 0.4)',
      20,
      'rgba(156, 207, 216, 0.82)',
    ])
  })

  it('keeps the original high-voltage road palette as Genesis', () => {
    const style = buildMapStyle('genesis') as {
      layers?: Array<{
        id?: string
        paint?: Record<string, unknown>
        layout?: Record<string, unknown>
      }>
    }

    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const casingLayer = style.layers?.find(
      layer => layer.id === 'roads_major_casing_late',
    )
    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )
    const railLayer = style.layers?.find(layer => layer.id === 'roads_rail')

    expect(roadsLayer?.paint?.['line-color']).toBe('#FF6A00')
    expect(casingLayer?.paint?.['line-color']).toBe('#F5006C')
    expect(buildingOutline?.paint?.['line-color']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      16.5,
      'rgba(69, 97, 255, 0.14)',
      18,
      'rgba(69, 97, 255, 0.58)',
      20,
      'rgba(69, 97, 255, 1)',
    ])
    expect(railLayer?.paint?.['line-color']).toBe('#F5006C')
    expect(railLayer?.layout?.visibility).toBe('visible')
  })

  it('combines Genesis road geometry with the Hype UI palette in Hyperpop', () => {
    const style = buildMapStyle('hyperpop') as {
      name?: string
      layers?: Array<{
        id?: string
        minzoom?: number
        type?: string
        'source-layer'?: string
        filter?: unknown[]
        paint?: Record<string, unknown>
      }>
    }

    const majorRoad = style.layers?.find(layer => layer.id === 'roads_major')
    const minorRoad = style.layers?.find(layer => layer.id === 'roads_minor')
    const highway = style.layers?.find(layer => layer.id === 'roads_highway')
    const path = style.layers?.find(layer => layer.id === 'roads_other')
    const casing = style.layers?.find(layer => layer.id === 'roads_major_casing_late')
    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )
    const boundaries = style.layers?.find(layer => layer.id === 'boundaries')
    const coastlineGutter = style.layers?.find(layer => layer.id === 'coastline_gutter')
    const coastline = style.layers?.find(layer => layer.id === 'coastline')
    const regionalBorderGutter = style.layers?.find(
      layer => layer.id === 'regional_border_gutter',
    )
    const regionalBorder = style.layers?.find(layer => layer.id === 'regional_border')
    const roadLabel = style.layers?.find(layer => layer.id === 'roads_labels_major')
    const labelGlow = style.layers?.find(
      layer => layer.id === 'roads_labels_major__glow',
    )

    expect(style.name).toBe('Hyperpop')
    expect(majorRoad?.paint?.['line-color']).toBe('#f04d7f')
    expect(minorRoad?.paint?.['line-color']).toBe('#d653b9')
    expect(highway?.paint?.['line-color']).toBe('#d653b9')
    expect(casing?.paint?.['line-color']).toBe('#7042f0')
    expect(casing?.paint?.['line-gap-width']).toEqual([
      'interpolate',
      ['exponential', 1.6],
      ['zoom'],
      6,
      0,
      12,
      1.6,
      15,
      3,
      18,
      13,
    ])
    expect(path?.minzoom).toBe(17)
    expect(buildingOutline?.minzoom).toBe(17)
    expect(buildingOutline?.paint?.['line-blur']).toBe(0.35)
    expect(boundaries?.layout?.visibility).toBe('none')
    expect(style.layers?.find(layer => layer.id === 'earth')?.filter).toEqual([
      'all',
      ['==', '$type', 'Polygon'],
      ['==', 'kind', 'earth'],
      ['==', 'saanseoi:base', true],
    ])
    expect(style.layers?.find(layer => layer.id === 'water')?.filter).toEqual([
      'all',
      ['==', '$type', 'Polygon'],
      ['==', 'kind', 'ocean'],
      ['==', 'sort_rank', 200],
      ['==', 'saanseoi:base', true],
    ])
    expect(coastlineGutter?.type).toBe('line')
    expect(coastlineGutter?.['source-layer']).toBe('water')
    expect(coastlineGutter?.filter).toEqual([
      'all',
      ['==', '$type', 'LineString'],
      ['==', 'kind', 'coastline'],
      ['==', 'saanseoi:base', true],
    ])
    expect(coastlineGutter?.paint?.['line-color']).toBe('#101214')
    expect(coastline?.type).toBe('line')
    expect(coastline?.['source-layer']).toBe('water')
    expect(coastline?.filter).toEqual([
      'all',
      ['==', '$type', 'LineString'],
      ['==', 'kind', 'coastline'],
      ['==', 'saanseoi:base', true],
    ])
    expect(coastline?.paint?.['line-color']).toBe('#7042f0')
    expect(regionalBorderGutter?.type).toBe('line')
    expect(regionalBorderGutter?.['source-layer']).toBe('boundaries')
    expect(regionalBorderGutter?.filter).toEqual([
      'all',
      ['==', '$type', 'LineString'],
      ['==', 'kind', 'region'],
      ['==', 'kind_detail', 4],
      ['==', 'saanseoi:region_border', true],
    ])
    expect(regionalBorderGutter?.paint?.['line-color']).toBe('#101214')
    expect(regionalBorder?.type).toBe('line')
    expect(regionalBorder?.['source-layer']).toBe('boundaries')
    expect(regionalBorder?.filter).toEqual([
      'all',
      ['==', '$type', 'LineString'],
      ['==', 'kind', 'region'],
      ['==', 'kind_detail', 4],
      ['==', 'saanseoi:region_border', true],
    ])
    expect(regionalBorder?.paint?.['line-color']).toBe('#7042f0')
    expect(roadLabel?.paint?.['text-color']).toBe('#d4dbff')
    expect(labelGlow?.paint?.['text-halo-color']).toBe('rgba(240, 77, 127, 0.72)')
  })

  it('gives Sin a calmer cherry, cobalt and plum palette', () => {
    const style = buildMapStyle('sin') as {
      layers?: Array<{ id?: string; paint?: Record<string, unknown> }>
    }

    const backgroundLayer = style.layers?.find(layer => layer.id === 'background')
    const roadsLayer = style.layers?.find(layer => layer.id === 'roads_major')
    const highwayLayer = style.layers?.find(layer => layer.id === 'roads_highway')
    const casingLayer = style.layers?.find(
      layer => layer.id === 'roads_major_casing_late',
    )
    const waterLayer = style.layers?.find(layer => layer.id === 'water')

    expect(backgroundLayer?.paint?.['background-color']).toBe('#102C66')
    expect(roadsLayer?.paint?.['line-color']).toBe('#F26C97')
    expect(highwayLayer?.paint?.['line-color']).toBe('#FFA45C')
    expect(casingLayer?.paint?.['line-color']).toBe('#8F376E')
    expect(waterLayer?.paint?.['fill-color']).toBe('#102C66')
  })

  it('removes hot pink labels from the ghostery style', () => {
    const style = buildMapStyle('ghostery') as {
      layers?: Array<{ id?: string; paint?: Record<string, unknown> }>
    }

    const majorRoadLabels = style.layers?.find(
      layer => layer.id === 'roads_labels_major',
    )

    expect(majorRoadLabels?.paint?.['text-color']).toBe('#FFFFFF')
    expect(majorRoadLabels?.paint?.['text-halo-color']).toBe('rgba(255,255,255,0.2)')
  })

  it('uses the original housenumber styling in the ghostery style', () => {
    const style = buildMapStyle('ghostery') as {
      layers?: Array<{
        id?: string
        minzoom?: number
        paint?: Record<string, unknown>
        layout?: Record<string, unknown>
      }>
    }

    const addressLabel = style.layers?.find(layer => layer.id === 'address_label')

    expect(addressLabel?.minzoom).toBe(19)
    expect(addressLabel?.paint?.['text-color']).toBe('rgba(240, 77, 127, 0.86)')
    expect(addressLabel?.layout?.['text-size']).toBe(12)
  })

  it('uses hot pink building outlines and hides district and island labels', () => {
    const style = buildMapStyle('ghostery') as {
      layers?: Array<{
        id?: string
        minzoom?: number
        paint?: Record<string, unknown>
        layout?: Record<string, unknown>
      }>
    }

    const buildingOutline = style.layers?.find(
      layer => layer.id === 'buildings_outline',
    )
    const boundaries = style.layers?.find(layer => layer.id === 'boundaries')
    const islandLabels = style.layers?.find(layer => layer.id === 'earth_label_islands')

    expect(buildingOutline?.minzoom).toBe(17)
    expect(buildingOutline?.paint?.['line-opacity']).toBe(0.8)
    expect(boundaries?.layout?.visibility).toBe('none')
    expect(islandLabels?.layout?.visibility).toBe('none')
  })

  it('collapses ghostery labels to the requested locale', () => {
    const style = buildMapStyle('ghostery', { locale: 'en' }) as {
      layers?: Array<{
        id?: string
        layout?: Record<string, unknown>
      }>
    }

    const localityLabel = style.layers?.find(layer => layer.id === 'places_locality')
    const textField = localityLabel?.layout?.['text-field'] as unknown[]

    expect(textField?.[0]).toBe('case')
    expect(textField?.[2]).toEqual([
      'format',
      [
        'coalesce',
        ['get', 'name:en'],
        ['get', 'name_en'],
        ['get', 'name2'],
        ['get', 'pgf:name2'],
      ],
      {},
      '\n',
      {},
      expect.any(Array),
      {},
    ])
  })

  it('keeps neighbourhood-style labels visible longer and includes macrohood', () => {
    const style = buildMapStyle('ghostery') as {
      layers?: Array<{
        id?: string
        maxzoom?: number
        filter?: unknown[]
      }>
    }

    const subplaceLayer = style.layers?.find(layer => layer.id === 'places_subplace')
    const regionLayer = style.layers?.find(layer => layer.id === 'places_region')

    expect(subplaceLayer?.maxzoom).toBe(17)
    expect(subplaceLayer?.filter).toEqual([
      'any',
      ['==', 'kind', 'neighbourhood'],
      ['==', 'kind', 'macrohood'],
    ])
    expect(regionLayer?.maxzoom).toBe(14)
  })
})
