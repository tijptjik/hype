import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { installStreetLabelPlacement } from '#lib/map/street-label-placement'

describe('alternate street label placement', () => {
  it('searches missing names in order and resets when the viewport changes', () => {
    const events = new Map<string, () => void>()
    const layers = [
      { id: 'roads_labels_minor__shift_3' },
      { id: 'roads_labels_minor__shift_0' },
      { id: 'roads_labels_minor' },
    ]
    const filters = vi.fn()
    const map = {
      on: (event: string, callback: () => void) => events.set(event, callback),
      off: (event: string) => events.delete(event),
      isMoving: () => false,
      isStyleLoaded: () => true,
      getStyle: () => ({ layers }),
      getFilter: () => ['in', 'kind', 'minor_road', 'other'],
      setFilter: filters,
      queryRenderedFeatures: vi
        .fn()
        .mockReturnValueOnce([{ properties: { name: '軒尼詩道' } }])
        .mockReturnValueOnce([
          { properties: { name: '軒尼詩道' } },
          { properties: { name: '駱克道' } },
        ]),
    }
    const cleanup = installStreetLabelPlacement(map as unknown as MapLibreMap)
    events.get('idle')?.()
    expect(filters.mock.calls.every(([, filter]) => filter[2] === '__disabled__')).toBe(
      true,
    )
    events.get('idle')?.()
    expect(filters).toHaveBeenLastCalledWith('roads_labels_minor__shift_0', [
      'all',
      ['in', 'kind', 'minor_road', 'other'],
      ['!in', 'name', '軒尼詩道'],
    ])
    events.get('idle')?.()
    expect(filters).toHaveBeenLastCalledWith('roads_labels_minor__shift_3', [
      'all',
      ['in', 'kind', 'minor_road', 'other'],
      ['!in', 'name', '軒尼詩道', '駱克道'],
    ])
    const settledCalls = filters.mock.calls.length
    events.get('idle')?.()
    expect(filters).toHaveBeenCalledTimes(settledCalls)
    events.get('moveend')?.()
    events.get('idle')?.()
    expect(filters).toHaveBeenCalledTimes(settledCalls + 2)
    cleanup()
    expect(events.size).toBe(0)
  })
})
