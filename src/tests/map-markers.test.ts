import { describe, expect, it } from 'vitest'

import { updateMarkers } from '$lib/map/markers'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

class TestMarker {
  element: HTMLElement

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

  remove(): void {}
}

describe('map markers', () => {
  it('eagerly loads image-backed markers on their first map render', () => {
    const markers = new Map()
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
})
