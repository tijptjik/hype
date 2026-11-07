// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// MAP
import {
  canLoadFeatureViewport,
  FEATURE_VIEWPORT_PAN_INTERVAL_MS,
  installFeatureViewportScheduler,
} from '#lib/map/viewportScheduler.js'

type SchedulerMap = Parameters<typeof installFeatureViewportScheduler>[0]
type SchedulerFixture = {
  map: SchedulerMap
  state: { moving: boolean; dragging: boolean; zooming: boolean; rotating: boolean }
  emit: (event: string) => void
  listenerCount: () => number
}

/** Builds an event-driven public MapLibre substitute. @returns Camera state and events. */
function fixture(): SchedulerFixture {
  const state = { moving: false, dragging: false, zooming: false, rotating: false }
  const listeners = new Map<string, Set<() => void>>()
  const map = {
    dragPan: { isActive: () => state.dragging },
    isMoving: () => state.moving,
    isZooming: () => state.zooming,
    isRotating: () => state.rotating,
    on: (event: string, listener: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
    },
    off: (event: string, listener: () => void) =>
      listeners.get(event)?.delete(listener),
  } as unknown as SchedulerMap
  return {
    map,
    state,
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) listener()
    },
    listenerCount: () =>
      [...listeners.values()].reduce((sum, group) => sum + group.size, 0),
  }
}

afterEach(() => vi.useRealTimers())

describe('feature viewport scheduling', () => {
  it('publishes stationary startup and idle resize, with one publication for native resize events', () => {
    const { map, emit } = fixture()
    const publish = vi.fn()
    const dispose = installFeatureViewportScheduler(map, {
      publish,
      isLoading: () => false,
    })
    expect(publish).toHaveBeenCalledOnce()
    emit('resize')
    expect(publish).toHaveBeenCalledTimes(2)

    // MapLibre's idle resize emits movement events without setting isMoving true.
    emit('movestart')
    emit('move')
    emit('resize')
    expect(publish).toHaveBeenCalledTimes(2)
    emit('moveend')
    expect(publish).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('waits for a sustained direct pan and keeps the latest endpoint after a short pan', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    const publish = vi.fn()
    const updateCamera = vi.fn()
    installFeatureViewportScheduler(map, {
      publish,
      updateCamera,
      isLoading: () => false,
    })
    Object.assign(state, { moving: true, dragging: true })
    emit('movestart')
    emit('move')
    vi.advanceTimersByTime(FEATURE_VIEWPORT_PAN_INTERVAL_MS - 1)
    expect(publish).toHaveBeenCalledOnce()
    emit('move')
    vi.advanceTimersByTime(1)
    expect(publish).toHaveBeenCalledTimes(2)
    emit('move')
    vi.advanceTimersByTime(100)
    Object.assign(state, { moving: false, dragging: false })
    emit('moveend')
    expect(publish).toHaveBeenCalledTimes(3)
    expect(updateCamera).toHaveBeenLastCalledWith(true)
    vi.advanceTimersByTime(1_000)
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('does not publish along a scripted flight, including a resize on the way', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    let camera = 'origin'
    const seen: string[] = []
    installFeatureViewportScheduler(map, {
      publish: () => seen.push(camera),
      isLoading: () => false,
    })
    state.moving = true
    emit('movestart')
    for (let frame = 0; frame < 25; frame++) {
      camera = `intermediate-${frame}`
      emit('move')
      vi.advanceTimersByTime(100)
    }
    emit('resize')
    expect(seen).toEqual(['origin'])
    camera = 'destination'
    state.moving = false
    emit('moveend')
    expect(seen).toEqual(['origin', 'destination'])
  })

  it.each(['zooming', 'rotating'] as const)(
    'cancels a direct-pan deadline when %s begins',
    mode => {
      vi.useFakeTimers()
      const { map, state, emit } = fixture()
      const publish = vi.fn()
      installFeatureViewportScheduler(map, { publish, isLoading: () => false })
      Object.assign(state, { moving: true, dragging: true })
      emit('move')
      vi.advanceTimersByTime(500)
      state[mode] = true
      emit('move')
      vi.advanceTimersByTime(2_000)
      expect(publish).toHaveBeenCalledOnce()
      Object.assign(state, { moving: false, dragging: false, [mode]: false })
      emit('moveend')
      expect(publish).toHaveBeenCalledTimes(2)
    },
  )

  it('rechecks a released drag before its deadline and waits through inertia', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    const publish = vi.fn()
    installFeatureViewportScheduler(map, { publish, isLoading: () => false })
    Object.assign(state, { moving: true, dragging: true })
    emit('move')
    vi.advanceTimersByTime(500)
    // Inertia preserves originalEvent and emits no new movestart, but dragPan is inactive.
    state.dragging = false
    vi.advanceTimersByTime(100)
    emit('move')
    vi.advanceTimersByTime(1_000)
    expect(publish).toHaveBeenCalledOnce()
    state.moving = false
    emit('moveend')
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending direct-pan update when a flight takes over', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    const publish = vi.fn()
    installFeatureViewportScheduler(map, { publish, isLoading: () => false })
    Object.assign(state, { moving: true, dragging: true })
    emit('move')
    vi.advanceTimersByTime(500)
    state.dragging = false
    emit('movestart')
    vi.advanceTimersByTime(2_000)
    expect(publish).toHaveBeenCalledOnce()
    state.moving = false
    emit('moveend')
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('skips a busy periodic query, resumes on later drag frames, and always publishes final', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    let loading = true
    const publish = vi.fn()
    installFeatureViewportScheduler(map, { publish, isLoading: () => loading })
    Object.assign(state, { moving: true, dragging: true })
    emit('move')
    vi.advanceTimersByTime(FEATURE_VIEWPORT_PAN_INTERVAL_MS)
    expect(publish).toHaveBeenCalledOnce()
    loading = false
    emit('move')
    vi.advanceTimersByTime(FEATURE_VIEWPORT_PAN_INTERVAL_MS)
    expect(publish).toHaveBeenCalledTimes(2)
    loading = true
    Object.assign(state, { moving: false, dragging: false })
    emit('moveend')
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('publishes the interrupted camera and the replacement gesture endpoint, never a captured destination', () => {
    vi.useFakeTimers()
    const { map, state, emit } = fixture()
    let camera = 'origin'
    const seen: string[] = []
    installFeatureViewportScheduler(map, {
      publish: () => seen.push(camera),
      isLoading: () => false,
    })
    state.moving = true
    emit('movestart')
    emit('move')
    camera = 'interrupted'
    state.moving = false
    emit('moveend')
    Object.assign(state, { moving: true, dragging: true })
    emit('movestart')
    emit('move')
    vi.advanceTimersByTime(100)
    camera = 'user endpoint'
    Object.assign(state, { moving: false, dragging: false })
    emit('moveend')
    vi.advanceTimersByTime(1_000)
    expect(seen).toEqual(['origin', 'interrupted', 'user endpoint'])
  })

  it('rechecks delayed request eligibility after movement changes', () => {
    const { map, state } = fixture()
    expect(canLoadFeatureViewport(map)).toBe(true)
    state.moving = true
    expect(canLoadFeatureViewport(map)).toBe(false)
    state.dragging = true
    expect(canLoadFeatureViewport(map)).toBe(true)
    state.zooming = true
    expect(canLoadFeatureViewport(map)).toBe(false)
    Object.assign(state, { dragging: false, zooming: false })
    expect(canLoadFeatureViewport(map)).toBe(false)
  })

  it('disposes all listeners and pending timers', () => {
    vi.useFakeTimers()
    const { map, state, emit, listenerCount } = fixture()
    const publish = vi.fn()
    const dispose = installFeatureViewportScheduler(map, {
      publish,
      isLoading: () => false,
    })
    Object.assign(state, { moving: true, dragging: true })
    emit('move')
    expect(listenerCount()).toBe(4)
    dispose()
    expect(listenerCount()).toBe(0)
    vi.advanceTimersByTime(1_000)
    emit('moveend')
    emit('resize')
    expect(publish).toHaveBeenCalledOnce()
  })
})
