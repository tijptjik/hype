// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeolocateControl, GeolocatePositionEvent } from 'maplibre-gl'
import {
  installLocationHeading,
  resolveLocationHeading,
} from '../lib/map/locationHeading'

const position = (
  heading: number | null,
  speed: number | null = 1,
): GeolocatePositionEvent =>
  ({
    coords: { heading, speed },
    timestamp: Date.now(),
  }) as GeolocatePositionEvent

afterEach(() => vi.useRealTimers())

describe('location travel bearing', () => {
  it('accepts north and missing speed, but rejects stationary, unavailable, invalid and old bearings', () => {
    expect(resolveLocationHeading(position(0))).toBe(0)
    expect(resolveLocationHeading(position(275, null))).toBe(275)
    for (const heading of [null, NaN, Infinity, -1, 360])
      expect(resolveLocationHeading(position(heading))).toBeNull()
    expect(resolveLocationHeading(position(90, 0))).toBeNull()
    expect(
      resolveLocationHeading({ ...position(90), timestamp: Date.now() - 15001 }),
    ).toBeNull()
  })

  it('aligns the existing marker to the map, hides stale/error fixes, and cleans up', () => {
    vi.useFakeTimers()
    const element = document.createElement('div')
    const handlers = new Map<string, (event: GeolocatePositionEvent) => void>()
    const marker = {
      getElement: () => element,
      setRotationAlignment: vi.fn().mockReturnThis(),
      setPitchAlignment: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
    }
    const control = {
      _userLocationDotMarker: marker,
      on: (event: string, fn: (event: GeolocatePositionEvent) => void) =>
        handlers.set(event, fn),
      off: (event: string) => handlers.delete(event),
    } as unknown as GeolocateControl
    const cleanup = installLocationHeading(control)
    const update = handlers.get('geolocate')
    if (!update) throw new Error('Missing geolocation listener')
    update(position(90))
    const cue = element.querySelector<HTMLSpanElement>('[data-location-heading]')
    if (!cue) throw new Error('Missing heading cue')
    expect(cue.hidden).toBe(false)
    expect(marker.setRotationAlignment).toHaveBeenCalledWith('map')
    expect(marker.setPitchAlignment).toHaveBeenCalledWith('map')
    expect(marker.setRotation).toHaveBeenCalledWith(90)
    update(position(0))
    expect(element.children).toHaveLength(1)
    vi.advanceTimersByTime(15001)
    expect(cue.hidden).toBe(true)
    update(position(180))
    handlers.get('error')?.(position(null))
    expect(cue.hidden).toBe(true)
    update(position(180))
    update(position(null))
    expect(cue.hidden).toBe(true)
    cleanup()
    expect(handlers.size).toBe(0)
    expect(element.children).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
