import { afterEach, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { installBrandLocationCanvas } from '../lib/locations/brandLocationCanvas'

afterEach(() => vi.unstubAllGlobals())
it('clusters 600 points, generates proportional sprites on demand and zooms clusters', async () => {
  const ctx = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    getImageData: () => ({}),
  }
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) })
  const images = new Set<string>(),
    layers = new Set<string>()
  const source = {
    setData: vi.fn(),
    getClusterExpansionZoom: vi.fn(async () => 15),
    getClusterLeaves: vi.fn(async () =>
      [0, 1].map(id => ({
        type: 'Feature',
        properties: Object.assign(Object.create(null), {
          id: String(id),
          icon: 'brand-status-7',
        }),
        geometry: { type: 'Point', coordinates: [114, 22] },
      })),
    ),
  }
  let installed = false
  const listeners = new Map<string, (event: any) => unknown>()
  const map = {
    getStyle: () => ({}),
    setMissingStyleImageResolver: vi.fn(),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => images.add(id)),
    getSource: (id: string) =>
      installed && id === 'brand-location-results' ? source : undefined,
    addSource: vi.fn((_id: string, _source: unknown) => {
      installed = true
    }),
    getLayer: (id: string) => layers.has(id),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    on: (event: string, layerOrHandler: any, handler?: any) =>
      listeners.set(
        `${event}:${handler ? layerOrHandler : ''}`,
        handler ?? layerOrHandler,
      ),
    off: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getMaxZoom: () => 22,
    project: () => ({ x: 100, y: 100 }),
    unproject: ([lng, lat]: number[]) => ({ lng, lat }),
    easeTo: vi.fn(),
  }
  const select = vi.fn()
  const renderer = installBrandLocationCanvas(map as unknown as MapLibreMap, select)
  const points = Array.from({ length: 600 }, (_, i) => ({
    id: String(i),
    name: `Branch ${i}`,
    coordinates: [114, 22] as [number, number],
    hype: true,
    upstream: false,
    linked: true,
  }))
  renderer.update(points)
  expect(map.addImage).toHaveBeenCalledTimes(8)
  expect(map.addSource).toHaveBeenCalledWith(
    'brand-location-results',
    expect.objectContaining({
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 14,
      maxzoom: 18,
      clusterProperties: expect.any(Object),
    }),
  )
  map.setMissingStyleImageResolver.mock.calls[0][0]('brand-cluster-20-10-5-20')
  expect(map.addImage).toHaveBeenCalledTimes(9)
  expect(ctx.fillText).toHaveBeenCalledWith('20', 56, 56, 42)
  renderer.update([{ ...points[0], shape: 'square' }])
  expect(ctx.rect).toHaveBeenCalled()
  expect(source.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({
      features: [
        expect.objectContaining({
          properties: expect.objectContaining({ icon: 'brand-status-5-square' }),
        }),
      ],
    }),
  )

  await listeners.get('click:brand-location-markers')?.({
    features: [
      {
        properties: { cluster: true, cluster_id: 1, point_count: 20 },
        geometry: { type: 'Point', coordinates: [114, 22] },
      },
    ],
  })
  expect(map.easeTo).toHaveBeenCalledWith({
    center: [114, 22],
    zoom: 15,
    duration: 350,
  })
  await listeners.get('click:brand-location-markers')?.({
    features: [
      { properties: { id: '42' }, geometry: { type: 'Point', coordinates: [114, 22] } },
    ],
  })
  expect(select).toHaveBeenCalledWith('42')
  source.getClusterExpansionZoom.mockResolvedValueOnce(25)
  await listeners.get('click:brand-location-markers')?.({
    features: [
      {
        properties: { cluster: true, cluster_id: 1, point_count: 2 },
        geometry: { type: 'Point', coordinates: [114, 22] },
      },
    ],
  })
  expect(map.addSource).toHaveBeenLastCalledWith(
    'brand-location-results-expanded',
    expect.objectContaining({
      data: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            geometry: { type: 'Point', coordinates: [148, 100] },
          }),
        ]),
      }),
    }),
  )
  expect(points[0].coordinates).toEqual([114, 22])
  const rendered = [0, 1].map(id => ({
    properties: Object.assign(Object.create(null), {
      id: String(id),
      icon: 'brand-status-7',
    }),
    geometry: { type: 'Point', coordinates: [114, 22] },
    layer: new Date(),
  }))
  await listeners.get('click:brand-location-markers')?.({ features: rendered })
  const expanded = map.addSource.mock.calls.at(-1)?.[1] as unknown as {
    data: { features: { type: string; properties: object; layer?: unknown }[] }
  }
  expect(
    expanded.data.features.every(
      feature =>
        feature.type === 'Feature' &&
        feature.layer === undefined &&
        Object.getPrototypeOf(feature.properties) === Object.prototype,
    ),
  ).toBe(true)

  renderer.update(points.slice(0, 300))
  expect(source.setData.mock.calls[0][0].features).toHaveLength(300)
  renderer.destroy()
})

it('moves and clears the selection outline without rebuilding result clusters', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>()
  const map = {
    getStyle: () => ({}),
    hasImage: () => false,
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    getLayer: (id: string) => layers.has(id),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    moveLayer: vi.fn(),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    on: vi.fn(),
    off: vi.fn(),
    setMissingStyleImageResolver: vi.fn(),
  }
  const renderer = installBrandLocationCanvas(map as unknown as MapLibreMap, vi.fn())
  renderer.update([
    {
      id: 'a',
      name: 'First',
      coordinates: [114, 22],
      hype: false,
      upstream: true,
      linked: false,
    },
    {
      id: 'b',
      name: 'Second',
      coordinates: [115, 23],
      hype: false,
      upstream: true,
      linked: false,
    },
  ])
  renderer.setSelected('a')
  expect(map.addLayer).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'brand-location-markers-selection',
      paint: expect.objectContaining({ 'circle-radius': 20, 'circle-stroke-width': 3 }),
    }),
  )
  renderer.setSelected('b')
  const outline = sources.get('brand-location-results-selection')
  if (!outline) throw new Error('Selection source missing')
  expect(outline.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({
      features: [
        expect.objectContaining({
          properties: { id: 'b' },
          geometry: { type: 'Point', coordinates: [115, 23] },
        }),
      ],
    }),
  )
  expect(sources.get('brand-location-results')?.setData).not.toHaveBeenCalled()
  renderer.setSelected(null)
  expect(outline.setData).toHaveBeenLastCalledWith({
    type: 'FeatureCollection',
    features: [],
  })
  renderer.destroy()
  expect(sources.has('brand-location-results-selection')).toBe(false)
  expect(layers.has('brand-location-markers-selection')).toBe(false)
})
