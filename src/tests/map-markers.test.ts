import { describe, expect, it } from 'vitest'

import { clearMarkers, updateMarkers } from '$lib/map/markers'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

class TestMarker {
  element: HTMLElement
  removed = false

  constructor({ element }: { element: HTMLElement }) {
    this.element = element
  }

  setLngLat(): this {
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
  }
}

describe('map markers', () => {
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
})
