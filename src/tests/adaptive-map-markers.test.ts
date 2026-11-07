// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'
// MAP
import {
  createAdaptiveMarkerRenderer,
  getPhotoMarkerBudget,
} from '#lib/map/adaptiveMarkers.js'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { MarkerPoint } from '#lib/map/markerPointLayer.js'
import type { MarkerRenderer } from '#lib/map/markers.js'

const factories = vi.hoisted(() => ({ native: vi.fn(), points: vi.fn() }))
vi.mock('#lib/map/markers.js', () => ({ createMarkerRenderer: factories.native }))
vi.mock('#lib/map/markerPointLayer.js', () => ({
  createMarkerPointLayer: factories.points,
}))

type MarkerOptions = NonNullable<Parameters<MarkerRenderer['sync']>[1]>

/** Builds a valid map-query point without coupling tests to unrelated entity fields. */
function feature(
  id: string,
  overrides: Partial<FeatureFromCollection> = {},
): FeatureFromCollection {
  return {
    id,
    projectId: 'project',
    layerId: 'photos',
    geometry: { type: 'Point', coordinates: [114.17, 22.32] },
    image: `https://images.example.test/${id}.jpg`,
    ...overrides,
  } as FeatureFromCollection
}

/** Creates a dense, entirely visible page with stable independent identities. */
function rows(count: number, prefix = 'feature'): FeatureFromCollection[] {
  return Array.from({ length: count }, (_, index) => feature(`${prefix}-${index}`))
}

/** Provides real coordinator dependencies while isolating native and GPU implementation details. */
function fixture(width = 390, coarse = false) {
  const state = { width, coarse, longitude: 114.17, moving: false }
  const events = new Map<string, Set<() => void>>()
  const native = {
    sync: vi.fn<(features: FeatureFromCollection[], options?: MarkerOptions) => void>(),
    updateCamera: vi.fn(),
    getElement: vi.fn(),
    clear: vi.fn(),
  }
  const points = {
    sync: vi.fn<(features: readonly MarkerPoint[]) => void>(),
    getFeatureIdAt: vi.fn(),
    clear: vi.fn(),
  }
  const map = {
    isMoving: () => state.moving,
    getContainer: () => ({ clientWidth: state.width, clientHeight: 844 }),
    getCenter: () => ({ lng: state.longitude }),
    project: ([longitude, latitude]: [number, number]) => ({
      x: state.width / 2 + (longitude - state.longitude) * 10_000,
      y: 422 + (latitude - 22.32) * 10_000,
    }),
    on: (event: string, listener: () => void) => {
      if (!events.has(event)) events.set(event, new Set())
      events.get(event)?.add(listener)
    },
    off: (event: string, listener: () => void) => events.get(event)?.delete(listener),
  } as unknown as MapLibreMap
  factories.native.mockReturnValue(native)
  factories.points.mockReturnValue(points)
  const renderer = createAdaptiveMarkerRenderer(map, {} as never, () => state.coarse)
  return {
    renderer,
    native,
    points,
    state,
    events,
    emit: (event: string) => {
      for (const listener of events.get(event) ?? []) listener()
    },
    nativeRows: (): FeatureFromCollection[] => native.sync.mock.calls.at(-1)?.[0] ?? [],
    pointRows: (): readonly MarkerPoint[] => points.sync.mock.calls.at(-1)?.[0] ?? [],
  }
}

const retained: MarkerOptions = { retention: { scope: 'public:photos', budget: 1000 } }

beforeEach(() => vi.clearAllMocks())

describe('adaptive public map markers', () => {
  it('protects active operational markers at the total native ceiling before cached overlays', () => {
    const { renderer, nativeRows, pointRows } = fixture()
    const custom = (id: string): FeatureFromCollection =>
      feature(id, { layerId: 'operational' })
    const options: MarkerOptions = {
      ...retained,
      markerStylesByLayerId: new Map([['operational', 'breadline']]),
    }
    renderer.sync(
      Array.from({ length: 64 }, (_, i) => custom(`cached-${i}`)),
      options,
    )
    const activeCustom = Array.from({ length: 400 }, (_, i) => custom(`active-${i}`))
    const photos = rows(100, 'photo')
    renderer.sync([...activeCustom, ...photos], options)
    const rendered = new Set(nativeRows().map(row => row.id))
    expect(rendered.size).toBe(500)
    for (const row of activeCustom) expect(rendered.has(row.id)).toBe(true)
    expect(pointRows()).toHaveLength(100)
    renderer.sync([...activeCustom, ...photos], { ...options, selectedId: 'cached-0' })
    expect(nativeRows()).toHaveLength(500)
    expect(nativeRows()[0].id).toBe('cached-0')
    expect(nativeRows().filter(row => row.layerId === 'operational')).toHaveLength(401)
    expect(pointRows()).toHaveLength(100)
    renderer.clear()
  })

  it('publishes new points during movement while keeping photo admission at the settled camera', () => {
    const { renderer, nativeRows, pointRows, state, emit } = fixture()
    const existing = rows(200)
    const arriving = rows(100, 'arriving')
    renderer.sync(existing, retained)
    const initial = new Set(nativeRows().map(row => row.id))
    state.moving = true
    emit('movestart')
    renderer.sync([...existing, ...arriving], retained)
    expect(new Set(nativeRows().map(row => row.id))).toEqual(initial)
    expect(pointRows()).toHaveLength(300)
    renderer.sync([...existing, ...arriving], {
      ...retained,
      selectedId: arriving[99].id,
    })
    expect(nativeRows().some(row => row.id === arriving[99].id)).toBe(true)
    expect(nativeRows()).toHaveLength(150)
    state.moving = false
    emit('moveend')
    expect(nativeRows()).toHaveLength(150)
    renderer.clear()
  })

  it('keeps a new scope as points until its in-progress flight settles', () => {
    const { renderer, nativeRows, pointRows, state, emit } = fixture()
    renderer.sync(rows(500), retained)
    state.moving = true
    emit('movestart')
    renderer.sync(rows(500, 'new'), { retention: { scope: 'new-scope', budget: 1000 } })
    expect(nativeRows()).toHaveLength(0)
    expect(pointRows()).toHaveLength(500)
    state.moving = false
    emit('moveend')
    expect(nativeRows()).toHaveLength(150)
    renderer.clear()
  })

  it('keeps all 500 GPU identities while reserving only 150 mobile photo overlays', () => {
    const { renderer, nativeRows, pointRows } = fixture()
    const features = rows(500)
    renderer.sync(features, retained)
    expect(pointRows()).toHaveLength(500)
    expect(new Set(pointRows().map(point => point.id))).toEqual(
      new Set(features.map(row => row.id)),
    )
    expect(nativeRows()).toHaveLength(150)
    expect(new Set(nativeRows().map(row => row.id)).size).toBe(150)
    expect(factories.native.mock.calls[0]?.[3]).toMatchObject({
      frameBudgetMs: 4,
      deferWhileMoving: true,
      attachRetained: false,
    })
    renderer.clear()
  })

  it('uses the desktop allowance while keeping touch tablets within the mobile allowance', () => {
    expect(getPhotoMarkerBudget(390)).toBe(150)
    expect(getPhotoMarkerBudget(1280)).toBe(500)
    expect(getPhotoMarkerBudget(1280, true)).toBe(150)
    const { renderer, state, emit, nativeRows, pointRows } = fixture(1280)
    renderer.sync(rows(500), retained)
    expect(nativeRows()).toHaveLength(500)
    state.coarse = true
    emit('resize')
    expect(nativeRows()).toHaveLength(150)
    expect(pointRows()).toHaveLength(500)
    state.coarse = false
    state.width = 390
    emit('resize')
    expect(nativeRows()).toHaveLength(150)
    renderer.clear()
  })

  it('promotes a late selected point without exceeding the mobile photo allowance', () => {
    const { renderer, nativeRows, pointRows } = fixture()
    const features = rows(500)
    renderer.sync(features, retained)
    const initiallyChosen = new Set(nativeRows().map(row => row.id))
    const selected = features.find(row => !initiallyChosen.has(row.id))
    if (!selected) throw new Error('Expected a selectable GPU-only point')
    renderer.sync(features, { ...retained, selectedId: selected.id })
    expect(nativeRows()).toHaveLength(150)
    expect(nativeRows().some(row => row.id === selected.id)).toBe(true)
    expect(pointRows().find(point => point.id === selected.id)?.selected).toBe(true)
    expect(nativeRows().filter(row => initiallyChosen.has(row.id))).toHaveLength(149)
    renderer.clear()
  })

  it('keeps the chosen photo membership stable across reordered equivalent data', () => {
    const { renderer, nativeRows } = fixture()
    const features = rows(500)
    renderer.sync(features, retained)
    const chosen = new Set(nativeRows().map(row => row.id))
    renderer.sync(features.toReversed(), retained)
    expect(new Set(nativeRows().map(row => row.id))).toEqual(chosen)
    renderer.clear()
  })

  it('propagates changed image and geometry for an already selected identity', () => {
    const { renderer, nativeRows, pointRows, native } = fixture()
    renderer.sync([feature('same')], { ...retained, selectedId: 'same' })
    const replacement = feature('same', {
      image: feature('replacement').image,
      geometry: { type: 'Point', coordinates: [114.175, 22.325] },
    })
    renderer.sync([replacement], { ...retained, selectedId: 'same' })
    expect(nativeRows()).toEqual([replacement])
    expect(pointRows()).toMatchObject([
      { id: 'same', coordinates: [114.175, 22.325], selected: true },
    ])
    expect(native.sync.mock.calls.at(-1)?.[1]?.selectedId).toBe('same')
    renderer.clear()
  })

  it('lets a null layer palette select the map theme instead of the project theme', () => {
    const { renderer, pointRows } = fixture()
    renderer.sync(
      [feature('map-palette', { layerId: 'map' }), feature('project-palette')],
      {
        ...retained,
        markerTheme: 'dark',
        markerThemesByProjectId: new Map([['project', 'rosepunk']]),
        markerThemesByLayerId: new Map([['map', null]]),
      },
    )
    expect(pointRows().find(point => point.id === 'map-palette')).toMatchObject({
      color: '#08070d',
      strokeColor: '#f7e7ef',
    })
    expect(pointRows().find(point => point.id === 'project-palette')).toMatchObject({
      color: '#e57ac5',
      strokeColor: '#fff0fb',
    })
    renderer.clear()
  })

  it('bounds parked presentation at 64 identities and can promote a scoped cached selection', () => {
    const { renderer, pointRows, nativeRows } = fixture()
    const previous = rows(500, 'previous')
    const active = rows(100, 'active')
    renderer.sync(previous, retained)
    renderer.sync(active, retained)
    expect(pointRows()).toHaveLength(164)
    expect(pointRows().filter(point => point.id.startsWith('previous-'))).toHaveLength(
      64,
    )
    expect(active.every(row => pointRows().some(point => point.id === row.id))).toBe(
      true,
    )
    const unshownCached = previous.find(
      row => !pointRows().some(point => point.id === row.id),
    )
    if (!unshownCached) throw new Error('Expected a cached point outside the 64 slots')
    renderer.sync(active, { ...retained, selectedId: unshownCached.id })
    expect(pointRows()).toHaveLength(164)
    expect(nativeRows()).toHaveLength(150)
    expect(nativeRows().some(row => row.id === unshownCached.id)).toBe(true)
    renderer.clear()
  })

  it('clears old point snapshots and retained identities on authorization/filter scope changes', () => {
    const { renderer, points, pointRows, nativeRows } = fixture()
    renderer.sync(rows(100, 'old'), retained)
    renderer.sync(rows(100, 'active'), retained)
    expect(pointRows()).toHaveLength(164)
    points.sync.mockClear()
    const replacement = rows(20, 'new-scope')
    renderer.sync(replacement, {
      retention: { scope: 'different-user:layers', budget: 1000 },
      selectedId: 'old-0',
    })
    expect(points.sync.mock.calls[0]?.[0]).toEqual([])
    expect(new Set(pointRows().map(point => point.id))).toEqual(
      new Set(replacement.map(row => row.id)),
    )
    expect(nativeRows()).toEqual(replacement)
    expect(nativeRows().some(row => row.id === 'old-0')).toBe(false)
    renderer.clear()
  })

  it('invalidates retained presentation after a style change and keeps dots off the native path', () => {
    const { renderer, points, native, nativeRows, pointRows } = fixture()
    renderer.sync(rows(100, 'old'), retained)
    const active = rows(40, 'active')
    renderer.sync(active, retained)
    points.sync.mockClear()
    renderer.sync(active, { ...retained, markerStyle: 'dot' })
    expect(points.sync.mock.calls[0]?.[0]).toEqual([])
    expect(pointRows()).toHaveLength(40)
    expect(nativeRows()).toEqual([])
    expect(native.sync.mock.calls.at(-1)?.[1]?.markerStyle).toBe('dot')
    const selected = active.at(-1)
    if (!selected) throw new Error('Expected a selectable dot')
    renderer.sync(active, { ...retained, markerStyle: 'dot', selectedId: selected.id })
    expect(nativeRows()).toEqual([selected])
    expect(pointRows()).toHaveLength(40)
    renderer.clear()
  })

  it('preserves flag and Breadline status markers as native presentations', () => {
    const { renderer, nativeRows, pointRows } = fixture()
    const custom = [
      feature('country-chip', { layerId: 'flags' }),
      feature('bakery-status', { layerId: 'breadline' }),
    ]
    renderer.sync([...rows(500), ...custom], {
      ...retained,
      markerStylesByLayerId: new Map([
        ['flags', 'flag'],
        ['breadline', 'breadline'],
      ]),
    })
    expect(pointRows()).toHaveLength(500)
    expect(pointRows().some(point => custom.some(row => row.id === point.id))).toBe(
      false,
    )
    expect(nativeRows()).toHaveLength(152)
    for (const row of custom) expect(nativeRows()).toContain(row)
    renderer.clear()
  })

  it('updates warm camera attachments without rebuilding GPU data on each movement frame', () => {
    const { renderer, native, points } = fixture()
    renderer.sync(rows(500), retained)
    points.sync.mockClear()
    native.sync.mockClear()
    renderer.updateCamera()
    renderer.updateCamera()
    expect(native.updateCamera.mock.calls).toEqual([[undefined], [undefined]])
    expect(points.sync).not.toHaveBeenCalled()
    expect(native.sync).not.toHaveBeenCalled()
    renderer.clear()
  })

  it('delegates selected element and point lookup and permanently disposes callbacks', () => {
    const { renderer, native, points, events, emit } = fixture()
    const element = {} as HTMLElement
    native.getElement.mockReturnValue(element)
    points.getFeatureIdAt.mockReturnValue('selected')
    expect(renderer.getElement('selected')).toBe(element)
    expect(renderer.getFeatureIdAt([10, 20])).toBe('selected')
    expect(points.getFeatureIdAt).toHaveBeenCalledWith([10, 20])
    renderer.sync(rows(20), retained)
    native.sync.mockClear()
    points.sync.mockClear()
    renderer.clear()
    renderer.clear()
    expect(native.clear).toHaveBeenCalledOnce()
    expect(points.clear).toHaveBeenCalledOnce()
    expect([...events.values()].every(listeners => listeners.size === 0)).toBe(true)
    emit('moveend')
    emit('resize')
    renderer.sync(rows(20, 'late'), retained)
    expect(native.sync).not.toHaveBeenCalled()
    expect(points.sync).not.toHaveBeenCalled()
  })
})
