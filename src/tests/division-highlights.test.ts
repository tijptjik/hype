// VITEST
import { describe, expect, it, vi } from 'vitest'
// DOMAIN
import { createDivisionHighlights } from '#lib/map/divisionHighlights.js'
import { readDivisionPolygons } from '#lib/divisions/geometry.js'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}

describe('division map highlights', () => {
  it('accepts membership polygons and rejects label points or malformed geometry', () => {
    expect(
      readDivisionPolygons({ membershipGeometry: [{ geometry: polygon }] }),
    ).toEqual([polygon])
    expect(readDivisionPolygons({ geometry: polygon })).toEqual([])
    expect(
      readDivisionPolygons({
        membershipGeometry: [{ geometry: { type: 'Point', coordinates: [0, 0] } }],
      }),
    ).toEqual([])
  })

  it('restores selected/hovered polygons after style changes and removes listeners on disposal', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, unknown>()
    const events = new Map<string, () => void>()
    let ready = true
    const map = {
      isStyleLoaded: () => ready,
      getStyle: () => ({ layers: [{ id: 'labels', type: 'symbol' }] }),
      getSource: (id: string) => sources.get(id),
      addSource: vi.fn((id: string, _source: unknown) =>
        sources.set(id, { setData: vi.fn() }),
      ),
      removeSource: (id: string) => sources.delete(id),
      getLayer: (id: string) => layers.get(id),
      addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
      removeLayer: (id: string) => layers.delete(id),
      on: (event: string, handler: () => void) => events.set(event, handler),
      off: (event: string) => events.delete(event),
    }
    const renderer = createDivisionHighlights(map as unknown as MapLibreMap)
    const definition = { id: 'island', apiReleaseSet: 'release', geometries: [polygon] }
    renderer.update([definition], 'island')
    expect(map.addSource.mock.calls[0][1]).toMatchObject({
      data: { features: [{ properties: { divisionId: 'island', hovered: true } }] },
    })
    expect(layers.size).toBe(2)
    sources.clear()
    layers.clear()
    events.get('style.load')?.()
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(2)
    renderer.update([], null)
    expect([...sources.values()][0].setData).toHaveBeenLastCalledWith({
      type: 'FeatureCollection',
      features: [],
    })
    ready = false
    renderer.update([definition], null)
    ready = true
    events.get('idle')?.()
    const setData = [...sources.values()][0].setData
    expect(setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: { divisionId: 'island', hovered: false },
          }),
        ],
      }),
    )
    const writes = setData.mock.calls.length
    events.get('idle')?.()
    expect(setData).toHaveBeenCalledTimes(writes)
    renderer.destroy()
    expect(sources.size + layers.size + events.size).toBe(0)
  })
})
