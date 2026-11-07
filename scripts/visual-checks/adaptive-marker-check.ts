// BROWSER
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// TYPES
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { AdaptiveMarkerRenderer } from '../../src/lib/map/adaptiveMarkers'
import type { FeatureFromCollection } from '../../src/lib/db/zod/schema/feature.types'

/** Production renderer interactions on a synthetic map; no app server or remote assets. */
type CheckWindow = Window & {
  maplibregl: typeof import('maplibre-gl')
  createAdaptiveMarkerRenderer: typeof import('../../src/lib/map/adaptiveMarkers').createAdaptiveMarkerRenderer
  adaptiveMarkerCheck: {
    map: MapLibreMap
    renderer: AdaptiveMarkerRenderer
    rows: FeatureFromCollection[]
    scope: string
    selectedId: string | null
    selectedElement: HTMLElement | null
    errors: string[]
    gpuIds: () => string[]
    photoCount: () => number
    sync: () => void
    disposeInput: () => void
  }
}

const root = resolve(import.meta.dir, '../..')
const temporary = await mkdtemp(join(tmpdir(), 'hype-adaptive-marker-check-'))
const entry = join(temporary, 'entry.ts')
const screenshotPath = '/tmp/hype-adaptive-markers-check.png'
let bundle: string
try {
  await Bun.write(
    entry,
    `import { createAdaptiveMarkerRenderer } from '${root}/src/lib/map/adaptiveMarkers.ts';
window.createAdaptiveMarkerRenderer = createAdaptiveMarkerRenderer;`,
  )
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    plugins: [
      {
        name: 'local-marker-images',
        setup(build) {
          build.onLoad({ filter: /client\/services\/image\.ts$/ }, () => ({
            contents: 'export const getImageSrc = image => image',
            loader: 'js',
          }))
          build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
        },
      },
    ],
  })
  if (!built.success) throw new Error(String(built.logs))
  bundle = await built.outputs[0].text()
} finally {
  await rm(temporary, { recursive: true, force: true })
}

const browser = await chromium.launch({
  headless: true,
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: This manual dev-check harness does not use Turbo caching.
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  page.setDefaultTimeout(20_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('http://127.0.0.1:4173/adaptive-marker-check', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="map" style="position:absolute;inset:0"></div></body></html>',
    }),
  )
  await page.route('**/maplibre-dist/*', async route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: await readFile(
        `${root}/node_modules/maplibre-gl/dist/${new URL(route.request().url()).pathname.split('/').pop()}`,
        'utf8',
      ),
    }),
  )
  await page.goto('http://127.0.0.1:4173/adaptive-marker-check')
  await page.addStyleTag({
    content: `${await readFile(`${root}/node_modules/maplibre-gl/dist/maplibre-gl.css`, 'utf8')}\n${await readFile(`${root}/src/lib/styles/map-markers.css`, 'utf8')}\n.opacity-0{opacity:0}.opacity-100{opacity:1}`,
  })
  await page.addScriptTag({
    type: 'module',
    content: `import * as maplibregl from '/maplibre-dist/maplibre-gl.mjs'; window.maplibregl = maplibregl;`,
  })
  await page.waitForFunction(() =>
    Boolean((window as unknown as CheckWindow).maplibregl),
  )
  await page.addScriptTag({ content: bundle })
  await page.evaluate(async () => {
    const w = window as unknown as CheckWindow
    const map = new w.maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#19202b' },
          },
        ],
      },
      center: [114.17, 22.32],
      zoom: 13,
      attributionControl: false,
    })
    const errors: string[] = []
    map.on('error', event => errors.push(event.error.message))
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Map load timed out')), 15_000)
      map.once('load', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    const renderer = w.createAdaptiveMarkerRenderer(map, w.maplibregl, () => true)
    const rows = Array.from({ length: 500 }, (_, index) => {
      const point = map.unproject([
        14 + (index % 20) * 19,
        18 + Math.floor(index / 20) * 33,
      ])
      const hue = (index * 137.5) % 360
      const image = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="hsl(${hue} 45% 36%)"/><circle cx="64" cy="64" r="35" fill="hsl(${hue} 65% 78%)"/><text x="64" y="72" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#19202b">${index}</text></svg>`)}`
      return {
        id: `old-${index}`,
        projectId: 'project',
        layerId: 'photos',
        image,
        geometry: { type: 'Point', coordinates: point.toArray() },
      } as unknown as FeatureFromCollection
    })
    const state: CheckWindow['adaptiveMarkerCheck'] = {
      map,
      renderer,
      rows,
      scope: 'old-scope',
      selectedId: null,
      selectedElement: null,
      errors,
      gpuIds: () => {
        const ids = new Set<string>()
        for (const [id, source] of Object.entries(map.getStyle()?.sources ?? {})) {
          if (!id.startsWith('hype-marker-points-') || source.type !== 'geojson')
            continue
          if (
            typeof source.data !== 'object' ||
            source.data.type !== 'FeatureCollection'
          )
            continue
          for (const feature of source.data.features) {
            const id = feature.properties?.featureId
            if (typeof id === 'string') ids.add(id)
          }
        }
        return [...ids]
      },
      photoCount: () =>
        document.querySelectorAll('.maplibregl-marker img.marker-image').length,
      sync: () =>
        renderer.sync(state.rows, {
          retention: { scope: state.scope, budget: 1000 },
          markerTheme: 'dark',
          selectedId: state.selectedId,
        }),
      disposeInput: () => {},
    }
    const onMove = (): void => renderer.updateCamera()
    const onMoveEnd = (): void => renderer.updateCamera(true)
    // Match the application adapter: native marker targets take precedence over canvas points.
    const onClick = (event: MapMouseEvent): void => {
      const target = event.originalEvent.target
      const nativeId =
        target instanceof Element
          ? target.closest<HTMLElement>('[data-feature-id]')?.dataset.featureId
          : undefined
      const id = nativeId ?? renderer.getFeatureIdAt(event.point)
      if (!id) return
      state.selectedId = id
      state.sync()
    }
    map.on('move', onMove)
    map.on('moveend', onMoveEnd)
    map.on('click', onClick)
    state.disposeInput = (): void => {
      map.off('move', onMove)
      map.off('moveend', onMoveEnd)
      map.off('click', onClick)
    }
    w.adaptiveMarkerCheck = state
    state.sync()
  })

  await page.waitForFunction(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return (
      state.photoCount() === 150 &&
      state.gpuIds().length === 500 &&
      state.map.isStyleLoaded()
    )
  })
  const initial = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return { photos: state.photoCount(), points: state.gpuIds().length }
  })
  const target = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    for (const row of state.rows) {
      if (state.renderer.getElement(row.id) || row.geometry.type !== 'Point') continue
      const point = state.map.project(row.geometry.coordinates as [number, number])
      const hit = document.elementFromPoint(point.x, point.y)
      if (!hit || hit.closest('.maplibregl-marker')) continue
      if (state.renderer.getFeatureIdAt(point) === row.id)
        return { id: row.id, x: point.x, y: point.y }
    }
    return null
  })
  assert.ok(target, 'Expected an uncovered GPU-only point for a real click')
  await page.mouse.click(target.x, target.y)
  await page.waitForFunction(id => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return (
      state.selectedId === id &&
      state.renderer.getElement(id)?.classList.contains('active')
    )
  }, target.id)
  const selected = await page.evaluate(id => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    state.selectedElement = state.renderer.getElement(id)
    return {
      id: state.selectedId,
      active: state.selectedElement?.classList.contains('active'),
      photos: state.photoCount(),
    }
  }, target.id)
  assert.equal(selected.active, true)
  assert.ok(selected.photos <= 150, 'Selection exceeded the photo budget')

  await page.evaluate(() => {
    ;(window as unknown as CheckWindow).adaptiveMarkerCheck.map.setStyle({
      version: 8,
      sources: {},
      layers: [
        {
          id: 'replacement-background',
          type: 'background',
          paint: { 'background-color': '#263040' },
        },
      ],
    })
  })
  await page.waitForFunction(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return state.map.isStyleLoaded() && state.gpuIds().length === 500
  })
  const restored = await page.evaluate(id => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    const row = state.rows.find(row => row.id === id)
    if (row?.geometry.type !== 'Point') throw new Error('Selected feature disappeared')
    const point = state.map.project(row.geometry.coordinates as [number, number])
    return {
      reused: state.renderer.getElement(id) === state.selectedElement,
      selected: state.renderer.getElement(id)?.classList.contains('active'),
      selectable: state.renderer.getFeatureIdAt(point) === id,
      points: state.gpuIds().length,
    }
  }, target.id)
  assert.deepEqual(restored, {
    reused: true,
    selected: true,
    selectable: true,
    points: 500,
  })

  await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    const center = state.map.getCenter()
    state.map.easeTo({
      center: [center.lng + 0.0002, center.lat],
      duration: 1400,
      essential: true,
    })
  })
  await page.waitForTimeout(100)
  const duringScopeChange = await page.evaluate(({ x, y }) => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    if (!state.map.isMoving())
      throw new Error('Scope change must occur during movement')
    state.rows = state.rows.map(row => ({ ...row, id: row.id.replace('old-', 'new-') }))
    state.scope = 'new-scope'
    state.selectedId = null
    state.sync()
    const hit = state.renderer.getFeatureIdAt([x, y])
    return {
      moving: state.map.isMoving(),
      photos: state.photoCount(),
      points: state.gpuIds().length,
      oldPointIds: state.gpuIds().filter(id => id.startsWith('old-')).length,
      oldPhotos: document.querySelectorAll(
        '.maplibregl-marker[data-feature-id^="old-"]',
      ).length,
      staleHit: hit?.startsWith('old-') ?? false,
    }
  }, target)
  assert.deepEqual(duringScopeChange, {
    moving: true,
    photos: 0,
    points: 500,
    oldPointIds: 0,
    oldPhotos: 0,
    staleHit: false,
  })
  await page.waitForTimeout(250)
  const deferred = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return { moving: state.map.isMoving(), photos: state.photoCount() }
  })
  assert.deepEqual(deferred, { moving: true, photos: 0 })
  await page.waitForFunction(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return (
      !state.map.isMoving() && state.photoCount() === 150 && state.map.isStyleLoaded()
    )
  })
  // Capture settled presentation after decoding and entry fades, not a loading frame.
  await page.waitForFunction(() => {
    const markers = [...document.querySelectorAll<HTMLElement>('.maplibregl-marker')]
    return markers.every(marker => {
      const image = marker.querySelector<HTMLImageElement>('img.marker-image')
      return (
        image?.complete &&
        image.naturalWidth > 0 &&
        marker.querySelector<HTMLElement>('.marker-inner')?.dataset.imageState ===
          'ready' &&
        marker
          .getAnimations({ subtree: true })
          .every(animation => animation.playState !== 'running' && !animation.pending)
      )
    })
  })
  await page.screenshot({ path: screenshotPath })

  const beforeDisposal = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    const result = { photos: state.photoCount(), points: state.gpuIds().length }
    state.disposeInput()
    state.renderer.clear()
    state.renderer.clear()
    state.sync()
    state.map.setStyle({ version: 8, sources: {}, layers: [] })
    const center = state.map.getCenter()
    state.map.easeTo({
      center: [center.lng - 0.0001, center.lat],
      duration: 100,
      essential: true,
    })
    return result
  })
  await page.waitForFunction(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    return !state.map.isMoving() && state.map.isStyleLoaded()
  })
  const disposed = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).adaptiveMarkerCheck
    const result = {
      photos: state.photoCount(),
      points: state.gpuIds().length,
      errors: state.errors,
    }
    state.map.remove()
    return result
  })
  assert.deepEqual(disposed, { photos: 0, points: 0, errors: [] })
  assert.deepEqual(pageErrors, [])
  console.log(
    JSON.stringify(
      {
        browserVersion: browser.version(),
        initial,
        selected,
        restored,
        duringScopeChange,
        deferred,
        beforeDisposal,
        disposed,
        pageErrors,
        screenshotPath,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
