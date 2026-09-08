// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { monkeyPatchMapLibre } from '$lib/map/maplibrePreload'

describe('MapLibre preload patch', () => {
  it('uses the canvas dimensions when precaching a fly-to transition', () => {
    class FakeMap {
      precache_worker = { postMessage: vi.fn() }

      getStyle = () => ({
        sources: {
          base: { type: 'vector', tiles: ['https://tiles.example/{z}/{x}/{y}.mvt'] },
        },
      })

      getSource = () => ({
        tiles: ['https://tiles.example/{z}/{x}/{y}.mvt'],
      })

      isStyleLoaded = () => true

      getCanvas = () => ({ width: 1280, height: 720 })

      getCenter = () => ({ lng: 114.17, lat: 22.3 })

      getZoom = () => 12

      unproject = vi.fn(() => ({ lng: 114.17, lat: 22.3 }))

      project = vi.fn(() => ({ sub: () => ({ x: 100, y: 100 }) }))

      once = vi.fn()
    }

    class FakeMercatorCoordinate {
      x: number
      y: number

      constructor(x: number, y: number) {
        this.x = x
        this.y = y
      }

      static fromLngLat = () => new FakeMercatorCoordinate(0.5, 0.5)
    }

    class FakeLngLat {
      constructor(
        readonly lng: number,
        readonly lat: number,
      ) {}

      wrap = () => this
    }

    const maplibre = {
      Map: FakeMap,
      MercatorCoordinate: FakeMercatorCoordinate,
      LngLat: FakeLngLat,
      getVersion: () => '6.2.0',
      prewarm: vi.fn(),
    }
    const map = new FakeMap() as FakeMap & {
      cachedFlyTo: (options: {
        center: [number, number]
        offset: [number, number]
      }) => void
    }

    monkeyPatchMapLibre(maplibre)

    expect(() =>
      // `transform` intentionally does not exist on this MapLibre 6-shaped map.
      map.cachedFlyTo({ center: [114.18, 22.31], offset: [80, 40] }),
    ).not.toThrow()
    expect(map.precache_worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: [1280, 720] }),
    )
  })

  it('defers preloading until TileJSON metadata is available', () => {
    class FakeMap {
      precache_worker = { postMessage: vi.fn() }

      getStyle = () => ({
        sources: {
          base: { type: 'vector', url: 'https://tiles.example/style.json' },
        },
      })

      getSource = () => ({})

      isStyleLoaded = () => false

      getCanvas = () => ({ width: 1280, height: 720 })

      getCenter = () => ({ lng: 114.17, lat: 22.3 })

      getZoom = () => 12

      once = vi.fn()
    }

    const maplibre = {
      Map: FakeMap,
      getVersion: () => '6.2.0',
      prewarm: vi.fn(),
    }
    const map = new FakeMap() as FakeMap & {
      cachedPanTo: (center: [number, number]) => void
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    monkeyPatchMapLibre(maplibre)
    map.cachedPanTo([114.18, 22.31])

    expect(map.precache_worker.postMessage).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
