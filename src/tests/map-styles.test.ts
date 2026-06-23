import { describe, expect, it } from 'vitest'

import { getUserMarkerStyleVariant } from '$lib/map/markers'
import { buildMapStyle, getDefaultMapStyleKey } from '$lib/map/styles'

describe('map styles', () => {
  it('defaults to the Ghostery style', () => {
    expect(getDefaultMapStyleKey()).toBe('ghostery')
  })

  it('defaults markers to image style and accepts dot override', () => {
    expect(getUserMarkerStyleVariant(null)).toBe('image')
    expect(getUserMarkerStyleVariant('anything-else')).toBe('image')
    expect(getUserMarkerStyleVariant('dot')).toBe('dot')
  })

  it('hides symbol layers when labels are disabled', () => {
    const style = buildMapStyle('hyper', { noLabels: true }) as {
      layers?: Array<{ type?: string; layout?: Record<string, unknown> }>
    }

    const symbolLayer = style.layers?.find(layer => layer.type === 'symbol')

    expect(symbolLayer).toBeUndefined()
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

  it('gives neorgange orange roads and cyan building outlines', () => {
    const style = buildMapStyle('neorgange') as {
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
