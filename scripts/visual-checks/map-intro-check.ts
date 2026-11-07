// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, type Page } from 'playwright'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: Manual browser check uses an existing dev server.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright'
await mkdir(output, { recursive: true })

type Box = {
  opacity: number
  visibility: string
  x: number
  y: number
  width: number
  height: number
  translate: string
  transform: string
  animations: number
}
type Frame = {
  at: number
  elapsed: number
  phase: string
  mapReadyAt: number | null
  map: Box | null
  search: Box | null
  nav: Box | null
  panel: Box | null
  overlay: Box | null
}
type CheckWindow = Window & { __introFrames?: Frame[] }

/**
 * Samples the actual mounted shells before their first browser frame.
 * @param page - New page receiving the fixture and frame collector.
 * @returns Completion once navigation interception and sampling are installed.
 */
async function prepare(page: Page): Promise<void> {
  await page.route('**/__map-intro-check.html*', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/mapIntroCheck.ts"></script></body></html>',
    }),
  )
  await page.addInitScript(() => {
    const frames: Frame[] = []
    ;(window as CheckWindow).__introFrames = frames
    let start: number | undefined
    const read = (selector: string): Box | null => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) return null
      const css = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        opacity: Number(css.opacity),
        visibility: css.visibility,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        translate: css.translate,
        transform: css.transform,
        animations: node
          .getAnimations()
          .filter(animation => ['running', 'pending'].includes(animation.playState))
          .length,
      }
    }
    const tick = (): void => {
      const surface = document.querySelector<HTMLElement>('[data-app-intro]')
      if (surface) {
        start ??= performance.now()
        const readyAt = document
          .querySelector('[data-intro-map]')
          ?.getAttribute('data-ready-at')
        frames.push({
          at: performance.now(),
          elapsed: performance.now() - start,
          phase: surface.dataset.appIntro ?? '',
          mapReadyAt: readyAt ? Number(readyAt) : null,
          map: read('[data-intro-map]'),
          search: read('[data-app-intro-item="search"]'),
          nav: read('[data-app-intro-item="nav"]'),
          panel: read('[data-app-intro-item="panel-left"]'),
          overlay: read('[data-selection]'),
        })
      }
      if (start === undefined || performance.now() - start < 10_000)
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Reads captured startup frames after the production entrance has completed.
 * @param page - Mounted fixture page.
 * @returns Sampled map and UI geometry through the completed entrance.
 */
async function initialFrames(page: Page): Promise<Frame[]> {
  await page.waitForFunction(() => {
    const frames = (window as CheckWindow).__introFrames ?? []
    const done = frames.find(frame => frame.phase === 'complete')
    return done && (frames.at(-1)?.at ?? 0) - done.at >= 100
  })
  return page.evaluate(() => (window as CheckWindow).__introFrames ?? [])
}

/**
 * Checks visible ordering, directional movement and fixed horizontal anchors.
 * @param frames - Recorded normal-motion startup.
 * @param width - Current layout viewport width.
 * @returns Measured delay and movement diagnostics.
 */
function verifyEntrance(frames: Frame[], width: number): Record<string, number> {
  const mapStart = frames.find(frame => (frame.map?.opacity ?? 0) > 0.01)
  const searchStart = frames.find(
    frame => frame.search?.visibility === 'visible' && frame.search.opacity > 0.01,
  )
  const navStart = frames.find(
    frame => frame.nav?.visibility === 'visible' && frame.nav.opacity > 0.01,
  )
  const settled = frames.at(-1)
  assert.ok(mapStart && searchStart && navStart && settled, 'Missing entrance frames')
  assert.ok(
    frames.some(frame => frame.map && frame.map.opacity > 0 && frame.map.opacity < 1),
    'Map did not fade through intermediate opacity',
  )
  assert.ok(
    searchStart.at - mapStart.at >= 50 && navStart.at - mapStart.at >= 50,
    'Controls did not wait for the map fade to begin',
  )
  assert.ok(searchStart.search && settled.search && navStart.nav && settled.nav)
  assert.ok(
    settled.search.y - searchStart.search.y > 2,
    'Search did not enter from top',
  )
  assert.ok(navStart.nav.y - settled.nav.y > 3, 'Navigation did not enter from bottom')
  for (const key of ['search', 'nav', 'overlay'] as const) {
    const boxes = frames.flatMap(frame => (frame[key] ? [frame[key]] : []))
    const centers = boxes.map(box => box.x + box.width / 2)
    assert.ok(
      Math.max(...centers) - Math.min(...centers) < 1.5,
      `${key}: horizontal anchor moved during intro`,
    )
  }
  const expectedCenter = width / 2 + (width >= 768 ? 48 : 0)
  assert.ok(
    Math.abs(settled.nav.x + settled.nav.width / 2 - expectedCenter) < 1.5,
    'Fixed navigation lost its existing horizontal offset',
  )
  assert.ok(settled.overlay, 'Centered overlay did not mount')
  assert.ok(
    Math.abs(settled.overlay.x + settled.overlay.width / 2 - width / 2) < 1.5,
    'Overlay lost its existing translate-based centering',
  )
  if (width >= 768) {
    assert.ok(settled.panel, 'Desktop panel did not mount')
    const panelStart = frames.find(
      frame => frame.panel?.visibility === 'visible' && frame.panel.opacity > 0.01,
    )
    assert.ok(panelStart?.panel)
    assert.ok(settled.panel.x - panelStart.panel.x > 2, 'Panel did not enter from left')
  }
  for (const key of ['map', 'search', 'nav'] as const) {
    assert.equal(settled[key]?.opacity, 1, `${key}: final opacity`)
    assert.equal(settled[key]?.animations, 0, `${key}: animation survived completion`)
  }
  assert.equal(settled.search.translate, 'none')
  assert.equal(settled.nav.translate, 'none')
  const overlayCenters = frames.flatMap(frame =>
    frame.overlay ? [frame.overlay.x + frame.overlay.width / 2] : [],
  )
  return {
    mapStartMs: mapStart.elapsed,
    searchDelayMs: searchStart.at - mapStart.at,
    navDelayMs: navStart.at - mapStart.at,
    searchTravelPx: settled.search.y - searchStart.search.y,
    navTravelPx: navStart.nav.y - settled.nav.y,
    overlayCenterDriftPx: Math.max(...overlayCenters) - Math.min(...overlayCenters),
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
})
const report: Record<string, unknown>[] = []
try {
  // Warm only Vite's module compilation; measured navigations use fresh pages/contexts.
  const warmup = await browser.newPage()
  await prepare(warmup)
  await warmup.goto(`${origin}/__map-intro-check.html`)
  await warmup.locator('[data-map-visual-ready="true"]').waitFor({ timeout: 60_000 })
  await warmup.close()

  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 844 : 900 },
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.goto(`${origin}/__map-intro-check.html`)
    const frames = await initialFrames(page)
    const diagnostics = verifyEntrance(frames, width)
    await page.getByRole('textbox', { name: 'Search places' }).fill('Hong Kong')
    const before = await page.evaluate(() => performance.now())
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector('[data-selection]')?.textContent?.includes('Saved'),
    )
    await page.waitForTimeout(650)
    const after = await page.evaluate(
      before =>
        ((window as CheckWindow).__introFrames ?? []).filter(
          frame => frame.at > before,
        ),
      before,
    )
    assert.ok(after.length > 3)
    assert.ok(
      after.every(frame => frame.phase === 'complete'),
      'Intro replayed',
    )
    assert.ok(
      after.every(frame => frame.map?.opacity === 1),
      'Map refaded on style change',
    )
    assert.ok(
      after.every(frame => frame.search?.opacity === 1 && frame.nav?.opacity === 1),
    )
    assert.equal(
      await page.getByRole('textbox', { name: 'Search places' }).inputValue(),
      'Hong Kong',
    )
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `${output}/map-intro-${width}.png` })
    await writeFile(
      `${output}/map-intro-${width}.json`,
      JSON.stringify(frames, null, 2),
    )
    const beforeRemount = await page.evaluate(() => performance.now())
    await page.getByRole('button', { name: 'Explore', exact: true }).click()
    await page.locator('[data-intro-map][data-generation="1"]').waitFor()
    // The outgoing panel can retain its keyed surface briefly during its outro.
    await page
      .locator('[data-intro-map][data-generation="0"]')
      .waitFor({ state: 'detached' })
    await page.getByRole('textbox', { name: 'Search places' }).fill('Ready immediately')
    await page.waitForTimeout(650)
    const remounted = await page.evaluate(
      since =>
        ((window as CheckWindow).__introFrames ?? []).filter(frame => frame.at > since),
      beforeRemount,
    )
    assert.ok(remounted.length > 3)
    assert.ok(
      remounted.every(frame => frame.phase === 'complete'),
      'Remounted surface replayed intro',
    )
    assert.ok(
      remounted.every(frame => frame.map?.opacity === 1),
      'Remounted map was hidden or faded',
    )
    assert.ok(
      remounted.every(
        frame =>
          frame.search?.visibility === 'visible' && frame.nav?.visibility === 'visible',
      ),
    )
    assert.ok(
      remounted.every(
        frame => frame.search?.animations === 0 && frame.nav?.animations === 0,
      ),
    )
    assert.deepEqual(errors, [])
    report.push({
      width,
      ...diagnostics,
      noReplay: true,
      retainedSearch: true,
      rebootstrapImmediatelyVisible: true,
    })
    await page.close()
  }

  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  await prepare(reduced)
  await reduced.goto(`${origin}/__map-intro-check.html`)
  await reduced.locator('[data-map-visual-ready="true"]').waitFor()
  const reducedFrames = await initialFrames(reduced)
  assert.ok(reducedFrames.every(frame => frame.phase === 'complete'))
  assert.ok(reducedFrames.every(frame => frame.search?.visibility === 'visible'))
  assert.ok(reducedFrames.every(frame => frame.nav?.translate === 'none'))
  assert.ok(
    reducedFrames.every(frame => !frame.map || [0, 1].includes(frame.map.opacity)),
  )
  report.push({ reducedMotion: true, immediateControls: true, noMapFade: true })
  await reduced.close()

  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await prepare(fallback)
  await fallback.goto(`${origin}/__map-intro-check.html?map=missing`)
  await fallback.locator('[data-app-intro="waiting"]').waitFor({ state: 'attached' })
  const hiddenCannotFocus = await fallback.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input')
    input?.focus()
    return document.activeElement !== input
  })
  assert.ok(hiddenCannotFocus, 'Pending search was still keyboard-focusable')
  const fallbackFrames = await initialFrames(fallback)
  const firstVisible = fallbackFrames.find(
    frame => frame.nav?.visibility === 'visible' && frame.nav.opacity > 0.01,
  )
  assert.ok(firstVisible && firstVisible.elapsed >= 1100 && firstVisible.elapsed < 2000)
  await fallback.getByRole('button', { name: 'Saved', exact: true }).click()
  assert.ok(
    (await fallback.locator('[data-selection]').textContent())?.includes('Saved'),
  )
  report.push({
    missingMap: true,
    fallbackControlsMs: firstVisible.elapsed,
    usable: true,
  })
  await fallback.close()

  const late = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const lateErrors: string[] = []
  late.on('pageerror', error => lateErrors.push(error.message))
  await prepare(late)
  await late.goto(`${origin}/__map-intro-check.html?map=late`)
  await late
    .getByRole('textbox', { name: 'Search places' })
    .fill('Available before map')
  assert.equal(await late.locator('.maplibregl-canvas').count(), 0)
  await late.locator('[data-map-visual-ready="true"]').waitFor()
  await late.waitForTimeout(650)
  const lateFrames = await late.evaluate(
    () => (window as CheckWindow).__introFrames ?? [],
  )
  const lateMapStart = lateFrames.find(frame => (frame.map?.opacity ?? 0) > 0.01)
  const earlyControls = lateFrames.find(
    frame => frame.search?.visibility === 'visible' && frame.search.opacity > 0.01,
  )
  assert.ok(lateMapStart && earlyControls)
  assert.ok(lateMapStart.at - earlyControls.at > 300, 'Late map gated usable controls')
  assert.ok(
    lateFrames.some(
      frame => frame.map && frame.map.opacity > 0 && frame.map.opacity < 1,
    ),
    'Late first map did not fade',
  )
  assert.ok(
    lateFrames
      .filter(frame => frame.at >= lateMapStart.at)
      .every(
        frame =>
          frame.phase === 'complete' &&
          frame.search?.opacity === 1 &&
          frame.nav?.opacity === 1,
      ),
    'Late map replayed the UI intro',
  )
  assert.equal(
    await late.getByRole('textbox', { name: 'Search places' }).inputValue(),
    'Available before map',
  )
  assert.deepEqual(lateErrors, [])
  report.push({
    lateMap: true,
    controlsBeforeMapMs: lateMapStart.at - earlyControls.at,
    lateMapFaded: true,
    noChromeReplay: true,
  })
  await late.close()
  await writeFile(`${output}/map-intro-report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
