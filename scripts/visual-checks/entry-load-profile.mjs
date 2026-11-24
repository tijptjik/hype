// Profile real entry routes through the managed Chrome runner with a fresh browser cache per visit.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const {
  PLAYWRIGHT_BASE_URL: base,
  DEV_RUNNER_ARTIFACTS: output,
  DEV_RUNNER_CHROME_CLASS: placement,
} = process.env
assert(base && output && placement, 'Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', '--disable-web-security', '--class=' + placement],
})
try {
  // Acquire only the local persona cookie. Neither measured page inherits HTTP cache entries.
  const seed = await browser.newContext()
  await seed.request.get(base)
  const session = await (await seed.request.get(base + '/api/auth/get-session')).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  const storageState = await seed.storageState()
  await seed.close()
  for (const path of ['/', '/admin']) {
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()
    await page.addInitScript(() => {
      performance.setResourceTimingBufferSize(18000)
      window.profilePaint = []
      new PerformanceObserver(list => {
        for (const e of list.getEntries())
          window.profilePaint.push([e.startTime, e.element?.tagName])
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(base + path, {
      waitUntil: 'commit',
      timeout: 120000,
    })
    assert.equal(response.status(), 200)
    if (path === '/admin') assert.equal(new URL(page.url()).pathname, '/admin/features')
    const selector =
      path === '/' ? '[data-app-intro="complete"]' : '[data-resource-index]'
    let ready = true
    try {
      await page.locator(selector).first().waitFor({ timeout: 120000 })
    } catch {
      ready = false
    }
    const readyMs = await page.evaluate(() => performance.now())
    await page.waitForTimeout(2000)
    const result = await page.evaluate(() => ({
      nav: performance.getEntriesByType('navigation')[0].toJSON(),
      paint: performance.getEntriesByType('paint').map(e => [e.name, e.startTime]),
      lcp: window.profilePaint,
      resources: performance.getEntriesByType('resource').map(e => ({
        path: new URL(e.name).pathname,
        start: Math.round(e.startTime),
        end: Math.round(e.responseEnd),
        bytes: e.encodedBodySize,
        type: e.initiatorType,
      })),
      mapCanvas: Boolean(document.querySelector('canvas.maplibregl-canvas')),
      featureRows: document.querySelectorAll('[data-entity-index]').length,
    }))
    const label = path === '/' ? 'homepage' : 'admin'
    await writeFile(
      output + '/' + label + '.json',
      JSON.stringify({ ...result, ready, readyMs, errors }),
    )
    console.log(
      label,
      JSON.stringify({
        ready,
        readyMs,
        ttfb: result.nav.responseStart,
        paint: result.paint,
        requests: result.resources.length,
        bytes: result.resources.reduce((sum, e) => sum + e.bytes, 0),
        mapCanvas: result.mapCanvas,
        featureRows: result.featureRows,
        errors,
      }),
    )
    await context.close()
  }
} finally {
  await browser.close()
}
