// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMarkerRenderer } from '#lib/map/markers.js'
import {
  getMarkerRetentionBudget,
  isWithinMarkerRetentionPerimeter,
} from '#lib/map/markerRetention.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

class TestMarker {
  static instances: TestMarker[] = []
  element: HTMLElement
  removed = false
  coordinates: [number, number] | undefined
  removals = 0
  attachments = 0
  positionUpdates = 0

  constructor({ element }: { element: HTMLElement }) {
    this.element = element
    TestMarker.instances.push(this)
  }

  setLngLat(coordinates: [number, number]): this {
    this.positionUpdates++
    this.coordinates = coordinates
    return this
  }

  addTo(): this {
    this.attachments++
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

const markerFactory = { Marker: TestMarker } as never
const map = {} as never
const retentionMap = {
  getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
  getCenter: () => ({ lng: 0 }),
  project: ([longitude, latitude]: [number, number]) => ({
    x: longitude * 100,
    y: latitude,
  }),
} as unknown as MapLibreMap
const feature = (id: string, coordinates: [number, number] = [114.17, 22.32]) =>
  ({
    id,
    projectId: 'project-1',
    geometry: { type: 'Point', coordinates },
    image: `https://images.example.test/${id}.jpg`,
  }) as unknown as FeatureFromCollection

describe('map markers', () => {
  beforeEach(() => {
    TestMarker.instances = []
  })
  afterEach(() => vi.useRealTimers())

  it('desaturates Black/White photos and replaces the renderer when returning to colour', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const row = feature('historic', [1, 1])
    renderer.sync([row], { markerStyle: 'image-bw' })
    const monochrome = renderer.getElement(row.id)
    expect(monochrome?.querySelector('img')?.style.filter).toBe('grayscale(1)')
    renderer.sync([row], { markerStyle: 'image' })
    const colour = renderer.getElement(row.id)
    expect(colour).not.toBe(monochrome)
    expect(colour?.querySelector('img')?.style.filter).toBe('')
  })

  it('keeps the same image and native marker through an offscreen return', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public:layers-a', budget: 1000 }
    const row = feature('nearby', [1, 1])
    renderer.sync([row], { retention })
    const original = renderer.getElement(row.id)
    if (!original) throw new Error('Expected a rendered marker')
    const image = original.querySelector('img')
    renderer.sync([], { retention })
    expect(renderer.getElement(row.id)).toBe(original)
    expect(original.hidden).toBe(false)
    expect(TestMarker.instances[0].removals).toBe(0)
    renderer.sync([row], { retention })
    expect(renderer.getElement(row.id)).toBe(original)
    expect(original.querySelector('img')).toBe(image)
    expect(original.hidden).toBe(false)
    expect(TestMarker.instances).toHaveLength(1)
  })

  it('detaches distant markers but preserves their image nodes until capacity is needed', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 1000 }
    const row = feature('distant', [50, 1])
    renderer.sync([row], { retention })
    const original = TestMarker.instances[0].getElement()
    renderer.sync([], { retention })
    expect(TestMarker.instances[0].attachments).toBe(0)
    expect(TestMarker.instances[0].removals).toBe(0)
    renderer.sync([row], { retention })
    expect(TestMarker.instances[0].getElement()).toBe(original)
    expect(TestMarker.instances).toHaveLength(1)
    renderer.sync([], { retention })
    renderer.clear()
    expect(renderer.getElement(row.id)).toBeNull()
  })

  it('reveals an approaching cached image during camera movement without another sync', () => {
    let x = 5000
    const camera = {
      ...retentionMap,
      project: () => ({ x, y: 100 }),
    } as unknown as MapLibreMap
    const renderer = createMarkerRenderer(camera, markerFactory)
    const retention = { scope: 'public', budget: 1000 }
    const row = feature('approaching')
    renderer.sync([row], { retention })
    const element = TestMarker.instances[0].getElement()
    if (!element) throw new Error('Expected a rendered marker')
    const image = element.querySelector('img')
    renderer.sync([], { retention })
    expect(renderer.getElement(row.id)).toBeNull()
    x = 900
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBe(element)
    expect(element.hidden).toBe(false)
    expect(element.querySelector('img')).toBe(image)
    x = 400
    renderer.updateCamera(true)
    expect(TestMarker.instances).toHaveLength(1)
    renderer.clear()
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBeNull()
  })

  it('detaches active rows outside overscan and reuses their image when the camera returns', () => {
    let x = 100
    const camera = {
      ...retentionMap,
      project: () => ({ x, y: 100 }),
    } as unknown as MapLibreMap
    const renderer = createMarkerRenderer(camera, markerFactory)
    const row = feature('active')
    renderer.sync([row], { retention: { scope: 'public', budget: 1000 } })
    const original = renderer.getElement(row.id)
    x = 5000
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBeNull()
    x = 100
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBe(original)
    expect(TestMarker.instances).toHaveLength(1)
    renderer.clear()
  })

  it('bounds camera scans during movement and forces the final camera position', () => {
    const project = vi.fn(() => ({ x: 100, y: 100 }))
    const camera = { ...retentionMap, project } as unknown as MapLibreMap
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const renderer = createMarkerRenderer(camera, markerFactory)
    renderer.sync([feature('row')], { retention: { scope: 'public', budget: 1000 } })
    project.mockClear()
    now.mockReturnValue(40)
    renderer.updateCamera()
    expect(project).not.toHaveBeenCalled()
    now.mockReturnValue(80)
    renderer.updateCamera()
    expect(project).toHaveBeenCalledTimes(1)
    renderer.updateCamera(true)
    expect(project).toHaveBeenCalledTimes(2)
    renderer.clear()
    now.mockRestore()
  })

  it('does not reposition unchanged markers during selection updates', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    const row = feature('unchanged')
    renderer.sync([row])
    renderer.sync([row], { selectedId: row.id })
    expect(TestMarker.instances[0].positionUpdates).toBe(1)
    expect(renderer.getElement(row.id)).toHaveClass('active')
    renderer.clear()
  })

  it('bounds live cached markers separately from warm images and protects active rows', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 1500 }
    const rows = Array.from({ length: 600 }, (_, i) => feature(`dense-${i}`, [1, 1]))
    renderer.sync(rows.slice(0, 500), { retention })
    renderer.sync(rows.slice(500), { retention })
    const attached = rows.filter(row => renderer.getElement(row.id))
    expect(attached).toHaveLength(164)
    for (const row of rows.slice(500))
      expect(renderer.getElement(row.id)).not.toBeNull()
    renderer.sync(rows.slice(0, 500), { retention })
    expect(rows.filter(row => renderer.getElement(row.id))).toHaveLength(500)
    expect(TestMarker.instances).toHaveLength(600)
    renderer.clear()
  })

  it('removes cached presentation immediately when its style changes', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 1000 }
    const row = feature('styled', [1, 1])
    renderer.sync([row], { retention })
    renderer.sync([], { retention })
    renderer.sync([], { retention, markerStyle: 'dot' })
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBeNull()
  })

  it('evicts distant cached markers before nearby ones and protects active markers', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const retention = { scope: 'public', budget: 500 }
    const near = feature('near', [1, 1])
    const far = feature('far', [50, 1])
    renderer.sync([near], { retention, markerStyle: 'dot' })
    const nearElement = renderer.getElement(near.id)
    renderer.sync([far], { retention, markerStyle: 'dot' })
    const farElement = TestMarker.instances.at(-1)?.getElement()
    const active = Array.from({ length: 499 }, (_, i) => feature(`active-${i}`, [1, 1]))
    renderer.sync(active, { retention, markerStyle: 'dot' })
    renderer.sync([near], { retention, markerStyle: 'dot' })
    expect(renderer.getElement(near.id)).toBe(nearElement)
    renderer.sync([far], { retention, markerStyle: 'dot' })
    expect(TestMarker.instances.at(-1)?.getElement()).not.toBe(farElement)
  })

  it('discards parked markers when filters or authorization scope changes', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const row = feature('scoped', [1, 1])
    renderer.sync([row], { retention: { scope: 'user-a', budget: 1000 } })
    const original = renderer.getElement(row.id)
    renderer.sync([], { retention: { scope: 'user-a', budget: 1000 } })
    renderer.sync([], { retention: { scope: 'user-b', budget: 1000 } })
    renderer.sync([row], { retention: { scope: 'user-b', budget: 1000 } })
    expect(renderer.getElement(row.id)).not.toBe(original)
  })

  it('hides the entire photo marker until decoded and fades it in only once', async () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('loading')])
    const marker = renderer.getElement('loading')!
    const inner = marker.querySelector<HTMLElement>('.marker-inner')!
    const image = marker.querySelector<HTMLImageElement>('img')!
    const decoded = Promise.withResolvers<void>()
    image.decode = vi.fn(() => decoded.promise)
    expect(marker.style.visibility).toBe('hidden')
    expect(marker).not.toHaveClass('marker-fade-in')
    expect(inner.dataset.imageState).toBe('loading')
    expect(image).toHaveClass('opacity-0')
    expect(inner.querySelector('.animate-pulse')).not.toBeNull()
    expect(marker.dataset.featureId).toBe('loading')
    image.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(image).toHaveClass('opacity-0')
    decoded.resolve()
    await Promise.resolve()
    expect(marker.style.visibility).toBe('')
    expect(marker).toHaveClass('marker-fade-in')
    const entered = new Event('animationend')
    Object.defineProperty(entered, 'animationName', { value: 'markerFadeIn' })
    marker.dispatchEvent(entered)
    renderer.sync([feature('loading')])
    expect(renderer.getElement('loading')).toBe(marker)
    expect(marker).not.toHaveClass('marker-fade-in')
    expect(inner.dataset.imageState).toBe('ready')
    expect(image).toHaveClass('opacity-100')
    expect(inner.querySelector('.animate-pulse')).toBeNull()
    renderer.clear()
  })

  it('keeps a static placeholder and marker target when an image fails', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('failed')])
    const marker = renderer.getElement('failed')!
    const inner = marker.querySelector<HTMLElement>('.marker-inner')!
    const image = marker.querySelector<HTMLImageElement>('img')!
    image.dispatchEvent(new Event('error'))
    expect(marker.style.visibility).toBe('')
    expect(inner.dataset.imageState).toBe('error')
    expect(image).toHaveClass('opacity-0')
    expect(inner.querySelector('.bg-base-300')).not.toBeNull()
    expect(inner.querySelector('.animate-pulse')).toBeNull()
    expect(marker.dataset.featureId).toBe('failed')
    renderer.clear()
  })

  it('eagerly loads image-backed markers on their first map render', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')])
    const markerImage = TestMarker.instances[0]
      ?.getElement()
      .querySelector<HTMLImageElement>('img.marker-image')
    expect(markerImage?.loading).toBe('eager')
  })

  it('uses the chosen map palette for default markers and updates retained markers', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const row = feature('etch-marker', [1, 1])
    const options = {
      retention: { scope: 'etch', budget: 1000 },
    }
    renderer.sync([row], { ...options, markerTheme: 'etch-dark' })
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--etch-dark')
    renderer.sync([], { ...options, markerTheme: 'etch-dark' })
    renderer.sync([row], { ...options, markerTheme: 'etch-light' })
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--etch-light')
    renderer.sync([row], options)
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--ghostery')
  })

  it.each([
    'light',
    'dark',
    'etch-dark',
    'etch-light',
    'ghostery',
    'hyperpop',
    'neon',
    'rosepunk',
  ] as const)(
    'preserves the explicit %s colour rule over the active default',
    palette => {
      const renderer = createMarkerRenderer(map, markerFactory)
      renderer.sync([feature('explicit')], {
        markerTheme: 'etch-light',
        markerThemesByProjectId: new Map([['project-1', palette]]),
      })
      expect(renderer.getElement('explicit')).toHaveClass(`marker-theme--${palette}`)
    },
  )

  it('respects layer overrides, inherited projects and User Preference independently', () => {
    const renderer = createMarkerRenderer(retentionMap, markerFactory)
    const row = { ...feature('layer-marker', [1, 1]), layerId: 'layer-1' }
    const options = {
      retention: { scope: 'layers', budget: 1000 },
      markerTheme: 'etch-dark' as const,
      markerThemesByProjectId: new Map([['project-1', 'neon' as const]]),
    }
    renderer.sync([row], options)
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--neon')
    renderer.sync([row], {
      ...options,
      markerThemesByLayerId: new Map([['layer-1', 'light']]),
    })
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--light')
    renderer.sync([], {
      ...options,
      markerThemesByLayerId: new Map([['layer-1', 'light']]),
    })
    renderer.sync([row], {
      ...options,
      markerThemesByLayerId: new Map([['layer-1', null]]),
    })
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--etch-dark')
    renderer.sync([row], options)
    expect(renderer.getElement(row.id)).toHaveClass('marker-theme--neon')
  })

  it('restyles image markers in place when their map-style theme changes', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'dark']]),
    })
    const firstMarker = TestMarker.instances[0]
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'hyperpop']]),
    })
    expect(firstMarker?.removed).toBe(false)
    expect(renderer.getElement('feature-1')).toBe(firstMarker?.element)
    expect(renderer.getElement('feature-1')).toHaveClass('marker-theme--hyperpop')
  })

  it('cancels fading removal when a filter reversal makes the same marker visible again', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    const currentFeature = feature('feature-1')
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    expect(marker.getElement()).toHaveClass('marker-fade-out')
    vi.advanceTimersByTime(150)
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    vi.advanceTimersByTime(500)
    expect(renderer.getElement('feature-1')).toBe(marker.getElement())
    expect(marker.removed).toBe(false)
    expect(marker.getElement()).not.toHaveClass('marker-fade-out')
  })

  it('does not postpone removal when repeated query updates still omit the marker', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    vi.advanceTimersByTime(150)
    renderer.sync([], { markerStyle: 'dot' })
    vi.advanceTimersByTime(150)
    expect(renderer.getElement('feature-1')).toBeNull()
    expect(marker.removals).toBe(1)
  })

  it('moves an unchanged dot marker when a refreshed feature has new coordinates', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    const currentFeature = feature('feature-1', [114.17, 22.32])
    renderer.sync([currentFeature], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([feature('feature-1', [114.27, 22.42])], { markerStyle: 'dot' })
    expect(TestMarker.instances).toHaveLength(1)
    expect(marker.coordinates).toEqual([114.27, 22.42])
    expect(marker.removed).toBe(false)
  })

  it('applies selected and highlighted ids when replacing a marker', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], {
      markerStyle: 'dot',
      selectedId: 'feature-1',
      highlightedIds: new Set(['feature-1']),
    })
    expect(renderer.getElement('feature-1')).toHaveClass('active', 'highlighted')
    renderer.sync([feature('feature-1')], {
      markerStyle: 'dot',
      selectedId: null,
      highlightedIds: new Set(),
    })
    expect(renderer.getElement('feature-1')).not.toHaveClass('active', 'highlighted')
  })

  it('clears every native marker and pending removal timer on teardown', () => {
    vi.useFakeTimers()
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], { markerStyle: 'dot' })
    const marker = TestMarker.instances[0]
    renderer.sync([], { markerStyle: 'dot' })
    renderer.clear()
    vi.advanceTimersByTime(300)
    expect(marker.removals).toBe(1)
    expect(renderer.getElement('feature-1')).toBeNull()
  })
})

describe('progressive native markers', () => {
  beforeEach(() => {
    TestMarker.instances = []
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** Builds controllable frames, native motion events and per-marker construction cost. @returns Progressive renderer fixture. */
  function progressiveFixture(costMs = 2.1, attachMs = 0) {
    let time = 0
    let nextFrame = 0
    let moving = false
    let offsetX = 0
    const frames = new Map<number, FrameRequestCallback>()
    const listeners = new Map<string, Set<() => void>>()
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const camera = {
      ...retentionMap,
      isMoving: () => moving,
      project: ([longitude, latitude]: [number, number]) => ({
        x: longitude * 100 + offsetX,
        y: latitude,
      }),
      on: (event: string, callback: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)?.add(callback)
      },
      off: (event: string, callback: () => void) =>
        listeners.get(event)?.delete(callback),
    } as unknown as MapLibreMap
    class CostedMarker extends TestMarker {
      constructor(options: { element: HTMLElement }) {
        super(options)
        time += costMs
      }

      addTo(): this {
        super.addTo()
        time += attachMs
        return this
      }
    }
    return {
      camera,
      factory: { Marker: CostedMarker } as never,
      frames,
      listeners,
      moveTo: (offset: number): void => {
        offsetX = offset
      },
      emit: (event: 'movestart' | 'moveend'): void => {
        moving = event === 'movestart'
        for (const callback of listeners.get(event) ?? []) callback()
      },
      frame: (): void => {
        time += 16
        const callbacks = [...frames.values()]
        frames.clear()
        for (const callback of callbacks) callback(time)
      },
    }
  }

  const retention = { scope: 'public', budget: 1000 }

  it('yields cold construction between frames while preserving every requested marker', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      frameBudgetMs: 4,
    })
    const rows = Array.from({ length: 5 }, (_, index) =>
      feature(`row-${index}`, [1, 1]),
    )
    renderer.sync(rows, { retention })
    expect(TestMarker.instances).toHaveLength(0)
    expect(fixture.frames.size).toBe(1)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(2)
    expect(fixture.frames.size).toBe(1)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(4)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(5)
    expect(rows.every(row => renderer.getElement(row.id))).toBe(true)
    expect(fixture.frames.size).toBe(0)
    renderer.clear()
  })

  it('pauses cold creation during motion without repeatedly requesting frames', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(
      fixture.camera,
      fixture.factory,
      undefined,
      {},
    )
    renderer.sync([feature('waiting', [1, 1])], { retention })
    fixture.emit('movestart')
    expect(fixture.frames.size).toBe(0)
    renderer.sync([feature('latest', [1, 1])], { retention })
    renderer.updateCamera(true)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(0)
    expect(fixture.frames.size).toBe(0)
    fixture.emit('moveend')
    fixture.frame()
    expect(renderer.getElement('latest')).not.toBeNull()
    expect(renderer.getElement('waiting')).toBeNull()
    renderer.clear()
  })

  it('includes native attachment cost in the frame deadline', () => {
    const fixture = progressiveFixture(0.1, 2.1)
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      frameBudgetMs: 4,
    })
    renderer.sync(
      Array.from({ length: 5 }, (_, index) => feature(`attach-${index}`, [1, 1])),
      { retention },
    )
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(2)
    expect(TestMarker.instances.every(marker => marker.attachments === 1)).toBe(true)
    expect(fixture.frames.size).toBe(1)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(4)
    renderer.clear()
  })

  it('does not create cold images beyond the live allowance and wakes on a larger allowance', () => {
    const fixture = progressiveFixture()
    let limit = 2
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      maxAttached: () => limit,
    })
    renderer.sync(
      Array.from({ length: 5 }, (_, index) => feature(`limited-${index}`, [1, 1])),
      { retention },
    )
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(2)
    expect(fixture.frames.size).toBe(0)
    limit = 3
    renderer.updateCamera(true)
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(3)
    expect(fixture.frames.size).toBe(0)
    renderer.clear()
  })

  it('does not create cold offscreen images and resumes only when they approach', () => {
    const fixture = progressiveFixture()
    const callback = vi.fn()
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, callback, {})
    renderer.sync([feature('distant', [50, 1])], { retention })
    expect(fixture.frames.size).toBe(0)
    expect(TestMarker.instances).toHaveLength(0)
    expect(callback).not.toHaveBeenCalled()
    fixture.moveTo(-4900)
    renderer.updateCamera(true)
    expect(fixture.frames.size).toBe(1)
    fixture.frame()
    const marker = renderer.getElement('distant')
    expect(marker?.querySelector('img')?.loading).toBe('eager')
    expect(callback).toHaveBeenCalledWith('distant', marker)
    renderer.clear()
  })

  it('reuses a warm node during movement while retaining excluded rich nodes detached', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      attachRetained: false,
    })
    const row = feature('warm', [1, 1])
    renderer.sync([row], { retention })
    fixture.frame()
    const original = renderer.getElement(row.id)
    const image = original?.querySelector('img')
    fixture.emit('movestart')
    renderer.sync([], { retention })
    renderer.updateCamera(true)
    expect(renderer.getElement(row.id)).toBeNull()
    expect(fixture.frames.size).toBe(0)
    renderer.sync([row], { retention })
    expect(renderer.getElement(row.id)).toBe(original)
    expect(renderer.getElement(row.id)?.querySelector('img')).toBe(image)
    expect(TestMarker.instances).toHaveLength(1)
    renderer.clear()
  })

  it('promotes a newly selected row during motion and keeps the attachment ceiling', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      maxAttached: 1,
      attachRetained: false,
    })
    const first = feature('first', [1, 1])
    const selected = feature('selected', [2, 1])
    renderer.sync([first], { retention })
    fixture.frame()
    fixture.emit('movestart')
    renderer.sync([first, selected], { retention, selectedId: selected.id })
    expect(renderer.getElement(first.id)).toBeNull()
    expect(renderer.getElement(selected.id)).toHaveClass('active')
    expect(TestMarker.instances).toHaveLength(2)
    expect(fixture.frames.size).toBe(0)
    renderer.clear()
  })

  it('resolves the current attachment limit and prioritizes highlighted active rows', () => {
    const fixture = progressiveFixture()
    let limit = 3
    const renderer = createMarkerRenderer(fixture.camera, fixture.factory, undefined, {
      maxAttached: () => limit,
    })
    const rows = [feature('a', [1, 1]), feature('b', [1, 1]), feature('c', [1, 1])]
    renderer.sync(rows, { retention, highlightedIds: new Set(['c']) })
    fixture.frame()
    fixture.frame()
    limit = 1
    renderer.updateCamera(true)
    expect(rows.filter(row => renderer.getElement(row.id)).map(row => row.id)).toEqual([
      'c',
    ])
    renderer.clear()
  })

  it('replaces queued style and scope work before constructing any stale image', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(
      fixture.camera,
      fixture.factory,
      undefined,
      {},
    )
    renderer.sync([feature('old', [1, 1])], { retention })
    renderer.sync([feature('new', [1, 1])], {
      retention: { scope: 'other-user', budget: 1000 },
      markerStyle: 'dot',
    })
    renderer.sync([feature('new', [1, 1])], {
      retention: { scope: 'other-user', budget: 1000 },
      markerStyle: 'image-bw',
    })
    fixture.frame()
    expect(TestMarker.instances).toHaveLength(1)
    expect(renderer.getElement('old')).toBeNull()
    expect(renderer.getElement('new')?.querySelector('img')?.style.filter).toBe(
      'grayscale(1)',
    )
    renderer.sync([], { retention: { scope: 'third-user', budget: 1000 } })
    expect(renderer.getElement('new')).toBeNull()
    renderer.clear()
  })

  it('keeps existing geometry, style and state changes immediate during motion', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(
      fixture.camera,
      fixture.factory,
      undefined,
      {},
    )
    renderer.sync([feature('changed', [1, 1])], { retention })
    fixture.frame()
    fixture.emit('movestart')
    renderer.sync([feature('changed', [2, 1])], {
      retention,
      markerStyle: 'dot',
      selectedId: 'changed',
    })
    expect(renderer.getElement('changed')).toHaveClass('active')
    expect(renderer.getElement('changed')?.querySelector('img')).toBeNull()
    expect(TestMarker.instances.at(-1)?.coordinates).toEqual([2, 1])
    expect(fixture.frames.size).toBe(0)
    renderer.clear()
  })

  it('cancels pending frames and motion listeners on disposal', () => {
    const fixture = progressiveFixture()
    const renderer = createMarkerRenderer(
      fixture.camera,
      fixture.factory,
      undefined,
      {},
    )
    renderer.sync([feature('never', [1, 1])], { retention })
    renderer.clear()
    expect(fixture.frames.size).toBe(0)
    expect([...fixture.listeners.values()].every(group => !group.size)).toBe(true)
    fixture.emit('moveend')
    fixture.frame()
    renderer.sync([feature('never', [1, 1])], { retention })
    expect(TestMarker.instances).toHaveLength(0)
  })
})

describe('marker retention policy', () => {
  it('uses conservative defaults and only raises the budget with both memory and CPU hints', () => {
    expect(getMarkerRetentionBudget()).toBe(1000)
    expect(getMarkerRetentionBudget({ hardwareConcurrency: 16 })).toBe(1000)
    expect(getMarkerRetentionBudget({ deviceMemory: 4, hardwareConcurrency: 16 })).toBe(
      750,
    )
    expect(getMarkerRetentionBudget({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(
      750,
    )
    expect(getMarkerRetentionBudget({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(
      1500,
    )
  })

  it('uses bounded screen overscan and accounts for wrapped longitudes', () => {
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [9.92, 1])).toBe(true)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [9.93, 1])).toBe(false)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [361, 1])).toBe(true)
    expect(isWithinMarkerRetentionPerimeter(retentionMap, [1, -193])).toBe(false)
  })
})

it('updates palette without replacing or decoding a surviving photo again', () => {
  const renderer = createMarkerRenderer(retentionMap, markerFactory)
  const row = feature('stable-photo', [1, 1])
  renderer.sync([row], {
    markerTheme: 'etch-dark',
    retention: { scope: 'first', budget: 1000 },
  })
  const element = renderer.getElement(row.id)!
  const image = element.querySelector('img')
  renderer.sync([row], {
    markerTheme: 'etch-light',
    retention: { scope: 'second', budget: 1000 },
  })
  expect(renderer.getElement(row.id)).toBe(element)
  expect(element.querySelector('img')).toBe(image)
  expect(element).toHaveClass('marker-theme--etch-light')
  expect(element).not.toHaveClass('marker-theme--etch-dark')
  renderer.clear()
})
