// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMarkerRenderer } from '$lib/map/markers'
import {
  getMarkerRetentionBudget,
  isWithinMarkerRetentionPerimeter,
} from '$lib/map/markerRetention'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

class TestMarker {
  static instances: TestMarker[] = []
  element: HTMLElement
  removed = false
  coordinates: [number, number] | undefined
  removals = 0

  constructor({ element }: { element: HTMLElement }) {
    this.element = element
    TestMarker.instances.push(this)
  }

  setLngLat(coordinates: [number, number]): this {
    this.coordinates = coordinates
    return this
  }

  addTo(): this {
    return this
  }

  getElement(): HTMLElement {
    return this.element
  }

  remove(): void {
    this.removed = true
    this.removals++
  }
}

const markerFactory = { Marker: TestMarker } as never
const map = {} as never
const retentionMap = {
  getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
  getCenter: () => ({ lng: 0 }),
  project: ([longitude, latitude]: [number, number]) => ({
    x: longitude * 100,
    y: latitude,
  }),
} as unknown as MapLibreMap
const feature = (id: string, coordinates: [number, number] = [114.17, 22.32]) =>
  ({
    id,
    projectId: 'project-1',
    geometry: { type: 'Point', coordinates },
    image: `https://images.example.test/${id}.jpg`,
  }) as unknown as FeatureFromCollection

describe('map markers', () => {
  beforeEach(() => {
    TestMarker.instances = []
  })
  afterEach(() => vi.useRealTimers())

  it('keeps the same image and native marker through an offscreen return', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public:layers-a', budget: 1000 }
    const row = feature('nearby', [1, 1])
    renderer.sync([row], { retention })
    const original = renderer.getElement(row.id)!
    const image = original.querySelector('img')
    renderer.sync([], { retention })
    expect(renderer.getElement(row.id)).toBeNull()
    expect(original.hidden).toBe(true)
    expect(TestMarker.instances[0].removals).toBe(0)
    renderer.sync([row], { retention })
    expect(renderer.getElement(row.id)).toBe(original)
    expect(original.querySelector('img')).toBe(image)
    expect(original.hidden).toBe(false)
    expect(TestMarker.instances).toHaveLength(1)
  })

  it('detaches distant markers but preserves their image nodes until capacity is needed', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 1000 }
    const row = feature('distant', [50, 1])
    renderer.sync([row], { retention })
    const original = renderer.getElement(row.id)
    renderer.sync([], { retention })
    expect(TestMarker.instances[0].removals).toBe(1)
    renderer.sync([row], { retention })
    expect(renderer.getElement(row.id)).toBe(original)
    expect(TestMarker.instances).toHaveLength(1)
    renderer.sync([], { retention })
    renderer.clear()
    expect(renderer.getElement(row.id)).toBeNull()
  })

  it('evicts distant cached markers before nearby ones and protects active markers', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 500 }
    const near = feature('near', [1, 1])
    const far = feature('far', [50, 1])
    renderer.sync([near], { retention, markerStyle: 'dot' })
    const nearElement = renderer.getElement(near.id)
    renderer.sync([far], { retention, markerStyle: 'dot' })
    const farElement = renderer.getElement(far.id)
    const active = Array.from({ length: 499 }, (_, i) => feature(`active-${i}`, [1, 1]))
    renderer.sync(active, { retention, markerStyle: 'dot' })
    renderer.sync([near], { retention, markerStyle: 'dot' })
    expect(renderer.getElement(near.id)).toBe(nearElement)
    renderer.sync([far], { retention, markerStyle: 'dot' })
    expect(renderer.getElement(far.id)).not.toBe(farElement)
  })

  it('discards parked markers when filters or authorization scope changes', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const row = feature('scoped', [1, 1])
    renderer.sync([row], { retention: { scope: 'user-a', budget: 1000 } })
    const original = renderer.getElement(row.id)
    renderer.sync([], { retention: { scope: 'user-a', budget: 1000 } })
    renderer.sync([], { retention: { scope: 'user-b', budget: 1000 } })
    renderer.sync([row], { retention: { scope: 'user-b', budget: 1000 } })
    expect(renderer.getElement(row.id)).not.toBe(original)
  })

  it('eagerly loads image-backed markers on their first map render', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')])
    const markerImage = TestMarker.instances[0]
      ?.getElement()
      .querySelector<HTMLImageElement>('img.marker-image')
    expect(markerImage?.loading).toBe('eager')
  })

  it('rebuilds image markers when their map-style theme changes', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'dark']]),
    })
    const firstMarker = TestMarker.instances[0]
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'hyperpop']]),
    })
    expect(firstMarker?.removed).toBe(true)
    expect(renderer.getElement('feature-1')).toHaveClass('marker-theme--hyperpop')
  })

  it('cancels fading removal when a filter reversal makes the same marker visible again', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    const currentFeature = feature('feature-1')
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    expect(marker.getElement()).toHaveClass('marker-fade-out')
    vi.advanceTimersByTime(150)
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    vi.advanceTimersByTime(500)
    expect(renderer.getElement('feature-1')).toBe(marker.getElement())
    expect(marker.removed).toBe(false)
    expect(marker.getElement()).not.toHaveClass('marker-fade-out')
  })

  it('does not postpone removal when repeated query updates still omit the marker', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    vi.advanceTimersByTime(150)
    renderer.sync([], { markerStyle: 'dot' })
    vi.advanceTimersByTime(150)
    expect(renderer.getElement('feature-1')).toBeNull()
    expect(marker.removals).toBe(1)
  })

  it('moves an unchanged dot marker when a refreshed feature has new coordinates', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    const currentFeature = feature('feature-1', [114.17, 22.32])
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([feature('feature-1', [114.27, 22.42])], { markerStyle: 'dot' })
    expect(TestMarker.instances).toHaveLength(1)
    expect(marker.coordinates).toEqual([114.27, 22.42])
    expect(marker.removed).toBe(false)
  })

  it('applies selected and highlighted ids when replacing a marker', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], {
      markerStyle: 'dot',
      selectedId: 'feature-1',
      highlightedIds: new Set(['feature-1']),
    })
    expect(renderer.getElement('feature-1')).toHaveClass('active', 'highlighted')
    renderer.sync([feature('feature-1')], {
      markerStyle: 'dot',
      selectedId: null,
      highlightedIds: new Set(),
    })
    expect(renderer.getElement('feature-1')).not.toHaveClass('active', 'highlighted')
  })

  it('clears every native marker and pending removal timer on teardown', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    renderer.clear()
    vi.advanceTimersByTime(300)
    expect(marker.removals).toBe(1)
    expect(renderer.getElement('feature-1')).toBeNull()
  })
})

describe('marker retention policy', () => {
  it('uses conservative defaults and only raises the budget with both memory and CPU hints', () => {
    expect(getMarkerRetentionBudget()).toBe(1000)
    expect(getMarkerRetentionBudget({ hardwareConcurrency: 16 })).toBe(1000)
    expect(getMarkerRetentionBudget({ deviceMemory: 4, hardwareConcurrency: 16 })).toBe(
      750,
    )
    expect(getMarkerRetentionBudget({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(
      750,
    )
    expect(getMarkerRetentionBudget({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(
      1500,
    )
  })

  it('uses two tile widths at each edge and accounts for wrapped longitudes', () => {
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [18.24, 1])).toBe(true)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [18.25, 1])).toBe(false)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [361, 1])).toBe(true)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [1, -1025])).toBe(false)
  })
})
