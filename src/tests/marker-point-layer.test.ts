// TESTS
import { describe, expect, it, vi } from 'vitest'
// MAP
import { createMarkerPointLayer, type MarkerPoint } from '#lib/map/markerPointLayer.js'
// TYPES
import type { FeatureCollection } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Builds isolated style/source ownership with controllable loading. @returns Map fixture. */
function fixture() {
  const state = { ready: true, parsed: true }
  const sources = new Map<
    string,
    { setData: ReturnType<typeof vi.fn>; data: unknown }
  >()
  const layers = new Map<string, { id: string; type?: string; source?: string }>([
    ['basemap-label', { id: 'basemap-label', type: 'symbol' }],
  ])
  const events = new Map<string, Set<() => void>>()
  const map = {
    isStyleLoaded: () => state.ready,
    getStyle: () =>
      state.parsed ? { version: 8, sources: {}, layers: [] } : undefined,
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, source: { data: unknown }) => {
      const entry = {
        data: source.data,
        setData: vi.fn((data: unknown) => {
          entry.data = data
        }),
      }
      sources.set(id, entry)
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((layer: { id: string; type?: string; source?: string }) => {
      layers.set(layer.id, layer)
    }),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    queryRenderedFeatures: vi.fn<() => { properties: { featureId: string } }[]>(
      () => [],
    ),
    on: (event: string, handler: () => void) => {
      if (!events.has(event)) events.set(event, new Set())
      events.get(event)?.add(handler)
    },
    off: (event: string, handler: () => void) => events.get(event)?.delete(handler),
  }
  return {
    map,
    native: map as unknown as MapLibreMap,
    state,
    sources,
    layers,
    events,
    emit: (event: string) => {
      for (const listener of events.get(event) ?? []) listener()
    },
  }
}

const point = (id: string, overrides: Partial<MarkerPoint> = {}): MarkerPoint => ({
  id,
  coordinates: [114.17, 22.32],
  color: '#e57ac5',
  strokeColor: '#fff0fb',
  ...overrides,
})

describe('GPU marker point layer', () => {
  it('keeps every point identity individual and renders above existing basemap layers', () => {
    const { native, map, sources, layers } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([
      point('a'),
      point('b', { selected: true }),
      point('c', { highlighted: true }),
    ])
    expect(sources.size).toBe(1)
    expect(map.addSource.mock.calls[0][1]).toMatchObject({
      type: 'geojson',
      cluster: false,
      data: {
        features: [
          {
            id: 'a',
            properties: { featureId: 'a', selected: false, highlighted: false },
          },
          { id: 'b', properties: { selected: true } },
          { id: 'c', properties: { highlighted: true } },
        ],
      },
    })
    expect([...layers.keys()][0]).toBe('basemap-label')
    expect(map.addLayer).toHaveBeenCalledTimes(2)
    expect(map.addLayer.mock.calls[1][0]).toMatchObject({
      type: 'circle',
      paint: { 'circle-radius': 7, 'circle-pitch-scale': 'viewport' },
    })
    renderer.clear()
  })

  it('does not resubmit unchanged data or register movement listeners', () => {
    const { native, sources, events, emit } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('a')])
    const source = [...sources.values()][0]
    renderer.sync([point('a')])
    emit('idle')
    emit('move')
    expect(source.setData).not.toHaveBeenCalled()
    expect([...events.keys()]).toEqual(['style.load', 'idle'])
    renderer.sync([point('a', { selected: true })])
    expect(source.setData).toHaveBeenCalledOnce()
    renderer.clear()
  })

  it('updates an existing source while source loading makes the style unready', () => {
    const { native, state, sources } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('a')])
    const source = [...sources.values()][0]
    state.ready = false
    renderer.sync([point('b')])
    expect(source.setData).toHaveBeenCalledWith(
      expect.objectContaining({ features: [expect.objectContaining({ id: 'b' })] }),
    )
    renderer.clear()
  })

  it('adds point overlays as soon as the style is parsed even while basemap tiles are pending', () => {
    const { native, state, sources, layers, emit } = fixture()
    state.ready = false
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('immediate')])
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(3)
    const source = [...sources.values()][0]
    emit('idle')
    expect(source.setData).not.toHaveBeenCalled()
    renderer.clear()
  })

  it('uses an explicit contrasting emphasis ring and falls back to the outline when omitted', () => {
    const { native, map, sources } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([
      point('selected', { color: '#08070d', selected: true, emphasisColor: '#d85f89' }),
      point('highlighted', { color: '#08070d', highlighted: true }),
    ])
    expect([...sources.values()][0].data).toMatchObject({
      features: [
        { id: 'selected', properties: { emphasisColor: '#d85f89' } },
        { id: 'highlighted', properties: { emphasisColor: '#fff0fb' } },
      ],
    })
    expect(map.addLayer.mock.calls[0]?.[0]).toMatchObject({
      paint: { 'circle-stroke-color': ['get', 'emphasisColor'] },
    })
    renderer.clear()
  })

  it('restores the latest immutable snapshot after initial loading and style replacement', () => {
    const { native, state, sources, layers, emit } = fixture()
    state.ready = false
    state.parsed = false
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('old')])
    const latest = point('latest')
    renderer.sync([latest])
    latest.coordinates[0] = 0
    expect(sources.size).toBe(0)
    state.parsed = true
    emit('style.load')
    const snapshot = [...sources.values()][0].data as FeatureCollection
    expect(snapshot.features).toMatchObject([
      { id: 'latest', geometry: { coordinates: [114.17, 22.32] } },
    ])
    sources.clear()
    layers.clear()
    emit('style.load')
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(2)
    expect([...sources.values()][0].data).toEqual(snapshot)
    renderer.clear()
  })

  it('removes an empty scope immediately and never resurrects it on style load', () => {
    const { native, map, sources, layers, state, emit } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('old-scope')])
    state.ready = false
    renderer.sync([])
    expect(sources.size).toBe(0)
    expect([...layers.keys()]).toEqual(['basemap-label'])
    map.queryRenderedFeatures.mockReturnValue([
      { properties: { featureId: 'old-scope' } },
    ])
    expect(renderer.getFeatureIdAt([20, 20])).toBeNull()
    expect(map.queryRenderedFeatures).not.toHaveBeenCalled()
    state.ready = true
    emit('style.load')
    emit('idle')
    expect(sources.size).toBe(0)
    renderer.clear()
  })

  it('hit-tests only its own layers and expands the target when a tap misses the visible point', () => {
    const { native, map, layers } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('target')])
    map.queryRenderedFeatures
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ properties: { featureId: 'target' } }])
    expect(renderer.getFeatureIdAt([40, 60])).toBe('target')
    const ownedLayers = [...layers.keys()]
      .filter(id => id !== 'basemap-label')
      .reverse()
    expect(map.queryRenderedFeatures.mock.calls).toEqual([
      [[40, 60], { layers: ownedLayers }],
      [
        [
          [32, 52],
          [48, 68],
        ],
        { layers: ownedLayers },
      ],
    ])
    renderer.clear()
  })

  it('ignores stale rendered source results after a new snapshot replaces their identities', () => {
    const { native, map } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([point('old')])
    renderer.sync([point('current')])
    map.queryRenderedFeatures.mockReturnValue([{ properties: { featureId: 'old' } }])
    expect(renderer.getFeatureIdAt([40, 60])).toBeNull()
    map.queryRenderedFeatures.mockReturnValue([
      { properties: { featureId: 'current' } },
    ])
    expect(renderer.getFeatureIdAt([40, 60])).toBe('current')
    renderer.clear()
  })

  it('owns separate IDs across renderers and disposes permanently without touching other layers', () => {
    const { native, map, sources, layers, events, emit } = fixture()
    const first = createMarkerPointLayer(native)
    const second = createMarkerPointLayer(native)
    first.sync([point('a')])
    second.sync([point('b')])
    expect(sources.size).toBe(2)
    expect(layers.size).toBe(5)
    const staleRestore = [...(events.get('style.load') ?? [])][0]
    first.clear()
    first.clear()
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(3)
    const sourceCalls = map.addSource.mock.calls.length
    staleRestore()
    first.sync([point('resurrected')])
    expect(map.addSource.mock.calls.length).toBe(sourceCalls)
    second.clear()
    emit('idle')
    emit('style.load')
    expect(sources.size).toBe(0)
    expect([...layers.keys()]).toEqual(['basemap-label'])
    expect([...events.values()].every(listeners => listeners.size === 0)).toBe(true)
  })

  it('rejects invalid coordinates and replaces duplicate identities deterministically', () => {
    const { native, sources } = fixture()
    const renderer = createMarkerPointLayer(native)
    renderer.sync([
      point('duplicate'),
      point('invalid', { coordinates: [NaN, 22] }),
      point('polar', { coordinates: [114, 91] }),
      point('duplicate', { selected: true }),
    ])
    expect([...sources.values()][0].data).toMatchObject({
      features: [{ id: 'duplicate', properties: { selected: true } }],
    })
    renderer.clear()
  })
})
