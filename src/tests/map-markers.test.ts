// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMarkers, updateMarkers } from '$lib/map/markers'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

class TestMarker {
  element: HTMLElement
  removed = false
  coordinates: [number, number] | undefined
  removals = 0

  constructor({ element }: { element: HTMLElement }) {
    this.element = element
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

describe('map markers', () => {
  afterEach(() => vi.useRealTimers())
  it('eagerly loads image-backed markers on their first map render', () => {
    const markers = new Map<string, TestMarker>()
    const appCtx = {
      map: {},
      state: { markers },
    }
    const features = [
      {
        id: 'feature-1',
        geometry: {
          type: 'Point',
          coordinates: [114.17276, 22.29191],
        },
        image: 'https://images.example.test/feature-1.jpg',
      },
    ] as unknown as FeatureFromCollection[]

    updateMarkers(appCtx as never, features, { Marker: TestMarker })

    const markerImage = markers
      .get('feature-1')
      ?.getElement()
      .querySelector<HTMLImageElement>('img.marker-image')

    expect(markerImage?.loading).toBe('eager')
  })

  it('rebuilds image markers when their map-style theme changes', () => {
    const markers = new Map<string, TestMarker>()
    const appCtx = { map: {}, state: { markers } }
    const features = [
      {
        id: 'feature-1',
        projectId: 'project-1',
        geometry: { type: 'Point', coordinates: [114.17276, 22.29191] },
        image: 'https://images.example.test/feature-1.jpg',
      },
    ] as unknown as FeatureFromCollection[]

    updateMarkers(
      appCtx as never,
      features,
      { Marker: TestMarker },
      'image',
      new Map([['project-1', 'dark']]),
    )
    const firstMarker = markers.get('feature-1')

    updateMarkers(
      appCtx as never,
      features,
      { Marker: TestMarker },
      'image',
      new Map([['project-1', 'hyperpop']]),
    )

    expect(firstMarker?.removed).toBe(true)
    expect(markers.get('feature-1')?.getElement()).toHaveClass('marker-theme--hyperpop')
  })

  it('clears detached marker objects before a replacement map mounts', () => {
    const marker = new TestMarker({ element: document.createElement('div') })
    const markers = new Map<string, TestMarker>([['feature-1', marker]])
    const appCtx = {
      state: { markers },
    }

    clearMarkers(appCtx as never)

    expect(marker.removed).toBe(true)
    expect(markers.size).toBe(0)
  })

  it('cancels fading removal when a filter reversal makes the same marker visible again', () => {
    vi.useFakeTimers()
    const markers = new Map<string, TestMarker>()
    const appCtx = { map: {}, state: { markers } }
    const feature = {
      id: 'feature-1',
      geometry: { type: 'Point', coordinates: [114.17, 22.32] },
    } as FeatureFromCollection
    updateMarkers(appCtx as never, [feature], { Marker: TestMarker }, 'dot')
    const marker = markers.get(feature.id)
    if (!marker) throw new Error('Expected the feature marker to be created')
    updateMarkers(appCtx as never, [], { Marker: TestMarker }, 'dot')
    expect(marker.getElement()).toHaveClass('marker-fade-out')
    vi.advanceTimersByTime(150)
    updateMarkers(appCtx as never, [feature], { Marker: TestMarker }, 'dot')
    vi.advanceTimersByTime(500)
    expect(markers.get(feature.id)).toBe(marker)
    expect(marker.removed).toBe(false)
    expect(marker.getElement()).not.toHaveClass('marker-fade-out')
  })

  it('does not postpone removal when repeated query updates still omit the marker', () => {
    vi.useFakeTimers()
    const marker = new TestMarker({ element: document.createElement('div') })
    const markers = new Map([['feature-1', marker]])
    const appCtx = { map: {}, state: { markers } }
    updateMarkers(appCtx as never, [], { Marker: TestMarker })
    vi.advanceTimersByTime(150)
    updateMarkers(appCtx as never, [], { Marker: TestMarker })
    vi.advanceTimersByTime(150)
    expect(markers.has('feature-1')).toBe(false)
    expect(marker.removals).toBe(1)
  })

  it('cannot delete a replacement marker when an earlier object finishes fading', () => {
    vi.useFakeTimers()
    const original = new TestMarker({ element: document.createElement('div') })
    const replacement = new TestMarker({ element: document.createElement('div') })
    const markers = new Map([['feature-1', original]])
    const appCtx = { map: {}, state: { markers } }
    updateMarkers(appCtx as never, [], { Marker: TestMarker })
    markers.set('feature-1', replacement)
    vi.advanceTimersByTime(300)
    expect(original.removed).toBe(true)
    expect(replacement.removed).toBe(false)
    expect(markers.get('feature-1')).toBe(replacement)
  })

  it('moves an unchanged dot marker when a refreshed feature has new coordinates', () => {
    const markers = new Map<string, TestMarker>()
    const appCtx = { map: {}, state: { markers } }
    const feature = {
      id: 'feature-1',
      geometry: { type: 'Point', coordinates: [114.17, 22.32] },
    } as FeatureFromCollection
    updateMarkers(appCtx as never, [feature], { Marker: TestMarker }, 'dot')
    const marker = markers.get(feature.id)
    if (!marker) throw new Error('Expected the feature marker to be created')
    updateMarkers(
      appCtx as never,
      [{ ...feature, geometry: { type: 'Point', coordinates: [114.27, 22.42] } }],
      { Marker: TestMarker },
      'dot',
    )
    expect(markers.get(feature.id)).toBe(marker)
    expect(marker.coordinates).toEqual([114.27, 22.42])
    expect(marker.removed).toBe(false)
  })

  it('clears pending removal timers before a replacement canvas starts', () => {
    vi.useFakeTimers()
    const marker = new TestMarker({ element: document.createElement('div') })
    const markers = new Map([['feature-1', marker]])
    const appCtx = { map: {}, state: { markers } }
    updateMarkers(appCtx as never, [], { Marker: TestMarker })
    clearMarkers(appCtx as never)
    vi.advanceTimersByTime(300)
    expect(marker.removals).toBe(1)
    expect(markers.size).toBe(0)
  })
})
