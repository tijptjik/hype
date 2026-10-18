import { describe, expect, it, vi } from 'vitest'
import { NavigationRouting } from '#lib/client/services/navigationRouting.svelte.js'
import type {
  Journey,
  RoutingPoint,
  RoutingRequest,
} from '#lib/routing/routing.types.js'

const point = { lat: 22.2819, lon: 114.1589 }
const destination = { lat: 22.2865, lon: 114.15, title: 'Sheung Wan' }
const journey: Journey = {
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [114.15, 22.28],
        [114.16, 22.29],
      ],
    ],
  },
  mode: 'pedestrian',
  seconds: 840,
  metres: 1188,
  cost: { currency: 'HKD', amount: 0 },
  segments: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [114.15, 22.28],
          [114.16, 22.29],
        ],
      },
      instruction: 'Walk west.',
      seconds: 840,
      metres: 1188,
      mode: 'pedestrian',
    },
  ],
  calculatedAt: '2026-10-18T00:00:00Z',
  hasFerry: false,
}

function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function setup(
  overrides: Partial<ConstructorParameters<typeof NavigationRouting>[0]> = {},
) {
  const capabilities = {
    locate: vi.fn(async () => point),
    warmup: vi.fn(async () => ({})),
    route: vi.fn(async (_request: RoutingRequest) => journey),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    ...overrides,
  }
  return { model: new NavigationRouting(capabilities), ...capabilities }
}

describe('navigation intent lifecycle', () => {
  it('prioritizes hover over focus, validates steps and clears highlights across lifecycle changes', async () => {
    const { model } = setup()
    model.highlightSegment(0, 'pointer')
    expect(model.highlightedSegment).toBeNull()
    await model.open(destination)
    model.highlightSegment(0, 'focus')
    model.highlightSegment(0, 'pointer')
    model.highlightSegment(null, 'pointer')
    expect(model.highlightedSegment).toBe(0)
    model.highlightSegment(null, 'focus')
    model.highlightSegment(999, 'pointer')
    expect(model.highlightedSegment).toBeNull()
    model.highlightSegment(0, 'focus')
    model.showMap()
    expect(model.highlightedSegment).toBeNull()
    model.showDirections()
    model.highlightSegment(0, 'pointer')
    await model.selectMode('auto')
    expect(model.highlightedSegment).toBeNull()
    model.highlightSegment(0, 'focus')
    model.close()
    expect(model.highlightedSegment).toBeNull()
  })
  it('retains a route when viewing the map, restores directions without fetching, and clears on End route', async () => {
    const { model, route, closePanel, openPanel } = setup()
    await model.open(destination)
    model.showMap()
    expect(model.showingMap).toBe(true)
    expect(model.state.phase).toBe('ready')
    expect(closePanel).toHaveBeenCalledTimes(1)
    model.showDirections()
    expect(model.showingMap).toBe(false)
    expect(openPanel).toHaveBeenCalledTimes(2)
    expect(route).toHaveBeenCalledTimes(1)
    model.close()
    expect(model.state.phase).toBe('idle')
    expect(model.destination).toBeNull()
  })
  it('warms immediately without coordinates and routes even if warm-up fails', async () => {
    const location = pending<RoutingPoint>()
    const warmup = vi.fn(async () => {
      throw new Error('temporary warm-up failure')
    })
    const { model, route } = setup({ locate: () => location.promise, warmup })
    const opened = model.open(destination)
    expect(warmup).toHaveBeenCalledWith()
    expect(model.state.phase).toBe('locating')
    expect(route).not.toHaveBeenCalled()
    location.resolve(point)
    await opened
    expect(route).toHaveBeenCalledWith({
      origin: point,
      destination,
      mode: 'pedestrian',
    })
    expect(model.state).toEqual({ phase: 'ready', journey })
  })

  it('does not route or reopen after dismissal while location permission is pending', async () => {
    const location = pending<RoutingPoint>()
    const { model, route } = setup({ locate: () => location.promise })
    const opened = model.open(destination)
    model.close()
    location.resolve(point)
    await opened
    expect(route).not.toHaveBeenCalled()
    expect(model.destination).toBeNull()
    expect(model.state.phase).toBe('idle')
  })

  it('keeps the newest mode result when older requests finish later', async () => {
    const old = pending<Journey>()
    const route = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ ...journey, mode: 'bicycle' })
    const { model } = setup({ route })
    const opened = model.open(destination)
    await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(1))
    await model.selectMode('bicycle')
    old.resolve(journey)
    await opened
    expect(model.state).toMatchObject({ phase: 'ready', journey: { mode: 'bicycle' } })
  })

  it('rejects out-of-coverage locations before calculating a route', async () => {
    const { model, route } = setup({ locate: async () => ({ lat: 51.5, lon: -0.12 }) })
    await model.open(destination)
    expect(route).not.toHaveBeenCalled()
    expect(model.state).toMatchObject({
      phase: 'error',
      message: expect.stringContaining('Hong Kong only'),
    })
  })

  it('allows location retry after permission denial', async () => {
    const locate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Location permission was denied.'))
      .mockResolvedValue(point)
    const { model } = setup({ locate })
    await model.open(destination)
    expect(model.state).toMatchObject({
      phase: 'error',
      message: expect.stringContaining('permission'),
    })
    await model.retry()
    expect(model.state.phase).toBe('ready')
  })
})
