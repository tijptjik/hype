import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMapController } from '$lib/map/controller'

type FakeMap = {
  getCenter: () => { lng: number; lat: number }
  getZoom: () => number
  getBearing: () => number
  getPitch: () => number
  flyTo: ReturnType<typeof vi.fn>
  easeTo: ReturnType<typeof vi.fn>
  jumpTo: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  loaded: () => boolean
  once: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

const createFakeMap = (): FakeMap => ({
  getCenter: () => ({ lng: 114.17, lat: 22.32 }),
  getZoom: () => 14,
  getBearing: () => 5,
  getPitch: () => 30,
  flyTo: vi.fn(),
  easeTo: vi.fn(),
  jumpTo: vi.fn(),
  fitBounds: vi.fn(),
  resize: vi.fn(),
  stop: vi.fn(),
  loaded: () => true,
  once: vi.fn(),
  off: vi.fn(),
})

describe('map controller', () => {
  afterEach(() => vi.restoreAllMocks())

  it('scopes camera commands to the current map instance', () => {
    let map: FakeMap | null = createFakeMap()
    const controller = createMapController(() => map as never)

    expect(controller.getCamera()).toEqual({
      center: [114.17, 22.32],
      zoom: 14,
      bearing: 5,
      pitch: 30,
    })
    controller.flyTo({ center: [114.18, 22.33], zoom: 16 })
    controller.easeTo({ center: [114.19, 22.34], duration: 200 })
    controller.fitBounds([[114.1, 22.2], [114.2, 22.4]], { duration: 0 })
    expect(map.flyTo).toHaveBeenCalledWith({ center: [114.18, 22.33], zoom: 16 })
    expect(map.easeTo).toHaveBeenCalledWith({ center: [114.19, 22.34], duration: 200 })
    expect(map.fitBounds).toHaveBeenCalledWith(
      [[114.1, 22.2], [114.2, 22.4]],
      { duration: 0 },
    )

    map = null
    expect(controller.getCamera()).toBeNull()
    controller.resize()
    controller.stop()
    expect(map).toBeNull()
  })

  it('stops orbit frames when the map is replaced or cleanup runs', () => {
    const firstMap = createFakeMap()
    let currentMap: FakeMap | null = firstMap
    const frameCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const stopOrbit = createMapController(() => currentMap as never).startOrbit({
      center: [114.17, 22.32],
      durationMs: 1_000,
    })
    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks[0]?.(0)
    expect(firstMap.jumpTo).toHaveBeenCalled()

    currentMap = createFakeMap()
    frameCallbacks[1]?.(100)
    expect(frameCallbacks).toHaveLength(2)
    stopOrbit?.()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2)
  })
})
