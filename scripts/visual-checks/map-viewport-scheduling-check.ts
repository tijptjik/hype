// BROWSER
import { chromium, type Page } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Native input proof with the production scheduler, an empty map, and no application server. */
type ViewportPublication = {
  atMs: number
  moving: boolean
  dragging: boolean
  zooming: boolean
  center: [number, number]
  zoom: number
}

type GestureObservation = {
  name: string
  publications: ViewportPublication[]
  publishedWhileMoving: number
  finalCount: number
  moveStarts: number
  moveEnds: number
  moveFrames: number
  inertiaFrames: number
  zoomFrames: number
  releasedAtMs: number | null
  finalCamera: { center: [number, number]; zoom: number }
}

type SchedulingCheckWindow = Window & {
  maplibregl: typeof import('maplibre-gl')
  installFeatureViewportScheduler: typeof import('../../src/lib/map/viewportScheduler').installFeatureViewportScheduler
  viewportSchedulingCheck: {
    map: MapLibreMap
    publications: ViewportPublication[]
    moveStarts: number
    moveEnds: number
    moveFrames: number
    inertiaFrames: number
    zoomFrames: number
    releasedAtMs: number | null
    startedAt: number
    reset: () => void
    dispose: () => void
  }
}

const root = resolve(import.meta.dir, '../..')
const temporary = await mkdtemp(join(tmpdir(), 'hype-viewport-scheduling-'))
const entry = join(temporary, 'entry.ts')
let bundle: string
try {
  await Bun.write(
    entry,
    `import { installFeatureViewportScheduler } from '${root}/src/lib/map/viewportScheduler.ts';
window.installFeatureViewportScheduler = installFeatureViewportScheduler;`,
  )
  const built = await Bun.build({ entrypoints: [entry], target: 'browser' })
  if (!built.success) throw new Error(String(built.logs))
  bundle = await built.outputs[0].text()
} finally {
  await rm(temporary, { recursive: true, force: true })
}

/**
 * Waits for a native gesture to end, including its inertial camera movement.
 * @param page - Page containing the real MapLibre instance.
 * @returns Completion after at least one moveend and a stationary camera.
 */
async function waitForSettledGesture(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck
      return (
        state.moveEnds > 0 && !state.map.isMoving() && !state.map.dragPan.isActive()
      )
    },
    undefined,
    { timeout: 15_000 },
  )
}

/**
 * Reads browser-observed publications and camera events after a gesture.
 * @param page - Page containing the scheduler instrumentation.
 * @param name - Human-readable native gesture name.
 * @returns Observed counts and timing, without treating publications as API requests.
 */
async function readGesture(page: Page, name: string): Promise<GestureObservation> {
  return page.evaluate(name => {
    const state = (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck
    const moving = state.publications.filter(publication => publication.moving)
    const final = state.publications.filter(publication => !publication.moving)
    return {
      name,
      publications: state.publications,
      publishedWhileMoving: moving.length,
      finalCount: final.length,
      moveStarts: state.moveStarts,
      moveEnds: state.moveEnds,
      moveFrames: state.moveFrames,
      inertiaFrames: state.inertiaFrames,
      zoomFrames: state.zoomFrames,
      releasedAtMs: state.releasedAtMs,
      finalCamera: {
        center: state.map.getCenter().toArray(),
        zoom: state.map.getZoom(),
      },
    }
  }, name)
}

/**
 * Verifies that settling publishes precisely one current endpoint.
 * @param result - Browser-observed gesture evidence.
 * @returns Nothing; throws when the event contract fails.
 */
function assertSettledEndpoint(result: GestureObservation): void {
  assert.ok(result.moveFrames > 0, `${result.name}: no native movement observed`)
  assert.equal(result.moveEnds, 1, `${result.name}: expected one native moveend`)
  assert.equal(result.finalCount, 1, `${result.name}: expected one settled publication`)
  const endpoint = result.publications.at(-1)
  assert.equal(endpoint?.moving, false, `${result.name}: last publication was moving`)
  assert.deepEqual(endpoint?.center, result.finalCamera.center)
  assert.equal(endpoint?.zoom, result.finalCamera.zoom)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })
  page.setDefaultTimeout(20_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://127.0.0.1:4173/viewport-scheduling-check', route =>
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
  await page.goto('http://127.0.0.1:4173/viewport-scheduling-check')
  await page.addStyleTag({
    content: await readFile(
      `${root}/node_modules/maplibre-gl/dist/maplibre-gl.css`,
      'utf8',
    ),
  })
  await page.addScriptTag({
    type: 'module',
    content: `import * as maplibregl from '/maplibre-dist/maplibre-gl.mjs'; window.maplibregl = maplibregl;`,
  })
  await page.waitForFunction(() =>
    Boolean((window as unknown as SchedulingCheckWindow).maplibregl),
  )
  await page.addScriptTag({ content: bundle })
  await page.evaluate(async () => {
    const w = window as unknown as SchedulingCheckWindow
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
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Map load timed out')), 15_000)
      map.once('load', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    const state: SchedulingCheckWindow['viewportSchedulingCheck'] = {
      map,
      publications: [],
      moveStarts: 0,
      moveEnds: 0,
      moveFrames: 0,
      inertiaFrames: 0,
      zoomFrames: 0,
      releasedAtMs: null,
      startedAt: performance.now(),
      reset: () => {
        state.publications = []
        state.moveStarts = 0
        state.moveEnds = 0
        state.moveFrames = 0
        state.inertiaFrames = 0
        state.zoomFrames = 0
        state.releasedAtMs = null
        state.startedAt = performance.now()
      },
      dispose: () => {},
    }
    map.on('movestart', () => {
      state.moveStarts++
    })
    map.on('moveend', () => {
      state.moveEnds++
    })
    map.on('move', () => {
      state.moveFrames++
      if (state.releasedAtMs !== null && !map.dragPan.isActive() && !map.isZooming())
        state.inertiaFrames++
    })
    map.on('zoom', () => {
      state.zoomFrames++
    })
    const disposeScheduler = w.installFeatureViewportScheduler(map, {
      publish: () =>
        state.publications.push({
          atMs: performance.now() - state.startedAt,
          moving: map.isMoving(),
          dragging: map.dragPan.isActive(),
          zooming: map.isZooming(),
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
        }),
      isLoading: () => false,
    })
    state.dispose = () => {
      disposeScheduler()
      map.remove()
    }
    // Exclude the scheduler's initial publication from every native gesture sample.
    state.reset()
    w.viewportSchedulingCheck = state
  })

  const results: GestureObservation[] = []
  try {
    await page.mouse.move(100, 420)
    await page.mouse.down()
    for (let step = 1; step <= 4; step++) {
      await page.mouse.move(100 + step * 30, 420)
      await page.waitForTimeout(20)
    }
    await page.evaluate(() => {
      const state = (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck
      state.releasedAtMs = performance.now() - state.startedAt
    })
    await page.mouse.up()
    await waitForSettledGesture(page)
    const shortPan = await readGesture(page, 'short mouse drag and inertia')
    assertSettledEndpoint(shortPan)
    assert.ok(shortPan.inertiaFrames > 0, 'Short drag did not exercise native inertia')
    assert.equal(
      shortPan.publishedWhileMoving,
      0,
      'Short drag or inertia published an intermediate viewport',
    )
    results.push(shortPan)

    await page.evaluate(() =>
      (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck.reset(),
    )
    await page.mouse.move(195, 420)
    await page.mouse.down()
    // Hold native drag input across several scheduler deadlines, without faking camera flags.
    for (let step = 1; step <= 30; step++) {
      await page.mouse.move(
        195 + Math.sin(step / 6) * 120,
        420 + Math.sin(step / 10) * 60,
      )
      await page.waitForTimeout(50)
    }
    await page.evaluate(() => {
      const state = (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck
      state.releasedAtMs = performance.now() - state.startedAt
    })
    await page.mouse.up()
    await waitForSettledGesture(page)
    const heldPan = await readGesture(page, 'held continuous mouse drag')
    assertSettledEndpoint(heldPan)
    assert.ok(heldPan.publishedWhileMoving >= 1, 'Held drag never published a viewport')
    const duringPan = heldPan.publications.filter(publication => publication.moving)
    for (const [index, publication] of duringPan.entries()) {
      assert.equal(
        publication.dragging,
        true,
        'Intermediate publication occurred after drag release',
      )
      assert.equal(publication.zooming, false, 'Pan publication occurred during zoom')
      const previous = index ? duringPan[index - 1].atMs : 0
      assert.ok(
        publication.atMs - previous >= 590,
        'Held drag published faster than the 600 ms cadence',
      )
    }
    results.push(heldPan)

    if (process.argv.includes('--touch')) {
      await page.evaluate(() =>
        (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck.reset(),
      )
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: 155, y: 420, id: 0 },
          { x: 235, y: 420, id: 1 },
        ],
      })
      for (let step = 1; step <= 30; step++) {
        const distance = 40 + step * 3
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: 195 - distance, y: 420, id: 0 },
            { x: 195 + distance, y: 420, id: 1 },
          ],
        })
        await page.waitForTimeout(40)
      }
      await page.evaluate(() => {
        const state = (window as unknown as SchedulingCheckWindow)
          .viewportSchedulingCheck
        state.releasedAtMs = performance.now() - state.startedAt
      })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await waitForSettledGesture(page)
      const pinch = await readGesture(page, 'native two-finger pinch')
      assertSettledEndpoint(pinch)
      assert.ok(pinch.zoomFrames > 0, 'Touch input did not produce native zoom events')
      assert.equal(
        pinch.publishedWhileMoving,
        0,
        'Pinch published an intermediate viewport',
      )
      results.push(pinch)
      await cdp.detach()
    }

    assert.deepEqual(errors, [], 'Browser page errors')
    console.log(JSON.stringify({ browserVersion: browser.version(), results }, null, 2))
  } finally {
    await page.evaluate(() =>
      (window as unknown as SchedulingCheckWindow).viewportSchedulingCheck.dispose(),
    )
  }
} finally {
  await browser.close()
}
