// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type {
  GeolocateControl,
  GeolocatePositionEvent,
  Map as MapLibreMap,
} from 'maplibre-gl'
import {
  canCenterOnLocation,
  installLocationTracking,
} from '../lib/map/locationTracking'

const fix = (overrides: object = {}, timestamp = Date.now()) =>
  ({
    coords: { latitude: 22.3, longitude: 114.17, accuracy: 20, ...overrides },
    timestamp,
  }) as GeolocatePositionEvent

function fixture() {
  const handlers = new Map<string, (event: GeolocatePositionEvent) => void>()
  const button = document.createElement('button')
  const originalCamera = vi.fn()
  const control = {
    _geolocateButton: button,
    _updateCamera: originalCamera,
    _onMoveStart: vi.fn(),
    trigger: vi.fn(),
    on: (key: string, fn: (event: GeolocatePositionEvent) => void) =>
      handlers.set(key, fn),
    off: (key: string) => handlers.delete(key),
  }
  let onMove: ((event: { originalEvent?: unknown }) => void) | undefined
  const map = {
    on: (_key: string, fn: typeof onMove) => {
      onMove = fn
    },
    off: vi.fn(),
  }
  const options = {
    onPosition: vi.fn(),
    canAutoCenter: vi.fn(() => true),
    onInitialFix: vi.fn(),
  }
  const install = () =>
    installLocationTracking(
      control as unknown as GeolocateControl,
      map as unknown as MapLibreMap,
      options,
    )
  const emit = (position: GeolocatePositionEvent) => {
    control._updateCamera(position)
    handlers.get('geolocate')?.(position)
  }
  return {
    control,
    button,
    originalCamera,
    options,
    handlers,
    install,
    emit,
    move: () => onMove?.({ originalEvent: {} }),
  }
}

describe('single-watch location startup', () => {
  it('rejects old, inaccurate and outside-Hong-Kong fixes for automatic centering', () => {
    expect(canCenterOnLocation(fix())).toBe(true)
    expect(canCenterOnLocation(fix({ accuracy: 101 }))).toBe(false)
    expect(canCenterOnLocation(fix({ accuracy: NaN }))).toBe(false)
    expect(canCenterOnLocation(fix({ longitude: -74 }))).toBe(false)
    expect(canCenterOnLocation(fix({}, Date.now() - 15001))).toBe(false)
  })
  it('publishes every orb fix but centers once only on a suitable one', () => {
    const f = fixture()
    const cleanup = f.install()
    f.emit(fix({ longitude: -74 }))
    f.emit(fix({ accuracy: 1000 }))
    expect(f.options.onPosition).toHaveBeenCalledTimes(2)
    expect(f.options.onInitialFix).not.toHaveBeenCalled()
    f.emit(fix())
    f.emit(fix())
    expect(f.options.onInitialFix).toHaveBeenCalledTimes(1)
    expect(f.originalCamera).not.toHaveBeenCalled()
    expect(f.control.trigger).toHaveBeenCalledTimes(1)
    expect(f.control._onMoveStart).toHaveBeenCalledTimes(4)
    f.button.click()
    f.emit(fix({ longitude: -74 }))
    expect(f.originalCamera).toHaveBeenCalledTimes(1)
    f.handlers.get('error')?.(fix())
    expect(f.options.onPosition).toHaveBeenLastCalledWith(null)
    cleanup()
    expect(f.handlers.size).toBe(0)
    expect(f.control._updateCamera).toBe(f.originalCamera)
  })
  it('does not interrupt map interaction or an explicitly selected initial view', () => {
    const f = fixture()
    const cleanup = f.install()
    f.move()
    f.emit(fix())
    expect(f.options.onInitialFix).not.toHaveBeenCalled()
    cleanup()
    const g = fixture()
    g.options.canAutoCenter.mockReturnValue(false)
    const dispose = g.install()
    g.options.canAutoCenter.mockReturnValue(true)
    g.emit(fix())
    expect(g.options.onInitialFix).not.toHaveBeenCalled()
    dispose()
  })
  it('waits for asynchronously enabled geolocation and cancels readiness on cleanup', async () => {
    const f = fixture()
    f.button.disabled = true
    const cleanup = f.install()
    expect(f.control.trigger).not.toHaveBeenCalled()
    f.button.disabled = false
    await Promise.resolve()
    expect(f.control.trigger).toHaveBeenCalledTimes(1)
    cleanup()
    const g = fixture()
    g.button.disabled = true
    const dispose = g.install()
    dispose()
    g.button.disabled = false
    await Promise.resolve()
    expect(g.control.trigger).not.toHaveBeenCalled()
  })
})
