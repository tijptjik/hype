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

  it('keeps marker images hidden behind a skeleton until decoding finishes', async () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('loading')])
    const marker = renderer.getElement('loading')!
    const inner = marker.querySelector<HTMLElement>('.marker-inner')!
    const image = marker.querySelector<HTMLImageElement>('img')!
    const decoded = Promise.withResolvers<void>()
    image.decode = vi.fn(() => decoded.promise)
    expect(inner.dataset.imageState).toBe('loading')
    expect(image).toHaveClass('opacity-0')
    expect(inner.querySelector('.animate-pulse')).not.toBeNull()
    expect(marker.dataset.featureId).toBe('loading')
    image.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(image).toHaveClass('opacity-0')
    decoded.resolve()
    await Promise.resolve()
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

  it('rebuilds image markers when their map-style theme changes', () => {
    const renderer = createMarkerRenderer(map, markerFactory)
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'dark']]),
    })
    const firstMarker = TestMarker.instances[0]
    renderer.sync([feature('feature-1')], {
      markerThemesByProjectId: new Map([['project-1', 'hyperpop']]),
    })
    expect(firstMarker?.removed).toBe(true)
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
