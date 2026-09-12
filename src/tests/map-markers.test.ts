// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMarkerRenderer } from '$lib/map/markers'
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
