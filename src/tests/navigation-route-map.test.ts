import { describe, expect, it, vi } from 'vitest'
import { createNavigationRoute } from '#lib/map/navigationRoute.js'
import { decodePolyline6, getRouteBounds } from '#lib/routing/routeGeometry.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MultiLineString } from 'geojson'

const geometry: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [
    [
      [114.14991, 22.28411],
      [114.16, 22.28],
    ],
    [
      [114.18, 22.29],
      [114.175, 22.3],
    ],
  ],
}

describe('native route geometry', () => {
  it('decodes polyline6, including signed deltas, into longitude/latitude order', () => {
    expect(decodePolyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
    expect(getRouteBounds(geometry)).toEqual([
      [114.14991, 22.28],
      [114.18, 22.3],
    ])
  })

  it('supports a zero-distance route and rejects truncated or invalid native shapes', () => {
    expect(decodePolyline6('??')).toEqual([
      [0, 0],
      [0, 0],
    ])
    for (const shape of ['', '?', '_', '~~~~~~~~~?', '\n?']) {
      expect(() => decodePolyline6(shape)).toThrow()
    }
  })
})

it('restores the latest route after a style replacement and removes only its own layers on disposal', () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, unknown>([['unrelated', {}]])
  const events = new Map<string, () => void>()
  let ready = false
  const map = {
    isStyleLoaded: () => ready,
    getStyle: () => ({ layers: [{ id: 'labels', type: 'symbol' }] }),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, _source: unknown) =>
      sources.set(id, { setData: vi.fn() }),
    ),
    removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((layer: { id: string }, _before?: string) =>
      layers.set(layer.id, layer),
    ),
    removeLayer: (id: string) => layers.delete(id),
    setPaintProperty: vi.fn(),
    on: (event: string, handler: () => void) => events.set(event, handler),
    off: (event: string) => events.delete(event),
  }
  const renderer = createNavigationRoute(map as unknown as MapLibreMap)
  renderer.update(geometry, 'light')
  expect(sources.size).toBe(0)
  ready = true
  events.get('idle')?.()
  expect(map.addSource.mock.calls[0][1]).toMatchObject({
    data: {
      features: [
        { properties: { kind: 'route' }, geometry },
        {
          properties: { kind: 'origin' },
          geometry: { type: 'Point', coordinates: [114.14991, 22.28411] },
        },
        {
          properties: { kind: 'destination' },
          geometry: { type: 'Point', coordinates: [114.175, 22.3] },
        },
      ],
    },
  })
  const segment = { type: 'LineString' as const, coordinates: geometry.coordinates[1] }
  renderer.highlight(segment)
  expect(map.addSource.mock.calls[1][1]).toMatchObject({
    data: { features: [{ geometry: segment }] },
  })
  const fullRouteUpdates = sources.get('hype-navigation-route')?.setData.mock.calls
    .length
  renderer.highlight({ type: 'Point', coordinates: geometry.coordinates[1][1] })
  expect(sources.get('hype-navigation-route')?.setData.mock.calls.length).toBe(
    fullRouteUpdates,
  )
  sources.clear()
  layers.clear()
  layers.set('unrelated', {})
  events.get('style.load')?.()
  expect(sources.size).toBe(2)
  expect(layers.size).toBe(7)
  expect(map.addSource.mock.calls.at(-1)?.[1]).toMatchObject({
    data: {
      features: [
        { geometry: { type: 'Point', coordinates: geometry.coordinates[1][1] } },
      ],
    },
  })
  renderer.highlight(null)
  expect(
    sources.get('hype-navigation-route-highlight')?.setData,
  ).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] })
  renderer.update(geometry, 'ghostery')
  expect(map.setPaintProperty).toHaveBeenCalledWith(
    'hype-navigation-route-line',
    'line-color',
    '#f04d7f',
  )
  renderer.destroy()
  expect(sources.size).toBe(0)
  expect([...layers.keys()]).toEqual(['unrelated'])
  expect(events.size).toBe(0)
})
