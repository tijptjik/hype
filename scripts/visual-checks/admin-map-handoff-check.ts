// PLAYWRIGHT
import { chromium } from 'playwright'
// FILESYSTEM
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.message)
    })
    // Real WebGL renderer, with a deterministic local style instead of external tiles.
    await page.route('**/src/lib/map/styles/index.ts*', route => {
      if (new URL(route.request().url()).searchParams.has('original'))
        return route.continue()
      return route.fulfill({
        contentType: 'text/javascript',
        body: `export * from '/src/lib/map/styles/index.ts?original'; export const buildCatalogMapStyle=()=>({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f5eee7'}}]});`,
      })
    })
    await page.route('**/__admin-map-handoff.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/adminMapHandoffCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__admin-map-handoff.html')
    await page.locator('[data-ready="true"]').waitFor({ timeout: 60000 })
    const canvas = await page.locator('canvas.maplibregl-canvas').elementHandle()
    if (!canvas) throw Error('Missing canvas')
    await page.getByRole('button', { name: 'Pan camera', exact: true }).click()
    await page.getByRole('button', { name: 'Read camera', exact: true }).click()
    const before = await page.locator('[data-camera]').innerText()
    // Watch every mutation so a short-lived loading skeleton cannot escape the assertion.
    await page.evaluate(() => {
      const state = { loadingReappeared: false }
      Object.assign(window, { mapHandoffCheck: state })
      new MutationObserver(records => {
        if (
          records.some(record =>
            [...record.addedNodes].some(
              node =>
                node instanceof Element &&
                (node.matches('[data-map-loading]') ||
                  node.querySelector('[data-map-loading]')),
            ),
          )
        )
          state.loadingReappeared = true
      }).observe(document.body, { childList: true, subtree: true })
    })
    await page.getByRole('button', { name: 'Leave route', exact: true }).click()
    await page.locator('[data-ready="false"]').waitFor({ state: 'attached' })
    if (!(await canvas.evaluate(element => element.isConnected)))
      throw Error('Canvas removed during route loading')
    await page.getByRole('button', { name: 'Open same Location', exact: true }).click()
    await page.locator('[data-ready="true"]').waitFor()
    await page.getByRole('button', { name: 'Read camera', exact: true }).click()
    if (before !== (await page.locator('[data-camera]').innerText()))
      throw Error('Same marker moved the camera')
    if (
      !(await canvas.evaluate(
        element => element.closest('[data-admin-map-outlet]') !== null,
      ))
    )
      throw Error('Canvas not transferred')
    await page
      .getByRole('button', { name: 'Open another Location', exact: true })
      .click()
    await page.locator('[data-ready="true"]').waitFor()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Read camera', exact: true }).click()
    const camera = JSON.parse(await page.locator('[data-camera]').innerText())
    if (
      Math.abs(camera.center[0] - 114.17) > 1e-6 ||
      Math.abs(camera.center[1] - 22.32) > 1e-6
    )
      throw Error(`Flight did not arrive: ${JSON.stringify(camera)}`)
    if (camera.zoom !== 17 || camera.bearing !== 23 || camera.pitch !== 30)
      throw Error('Camera orientation was reset')
    await page.getByRole('button', { name: 'Back to Feature', exact: true }).click()
    await page.locator('[data-ready="true"]').waitFor()
    if (
      !(await canvas.evaluate(
        element =>
          element.isConnected && element.closest('[data-admin-map-outlet]') !== null,
      ))
    )
      throw Error('Canvas remounted')
    if ((await page.locator('canvas.maplibregl-canvas').count()) !== 1)
      throw Error('Duplicate canvas')
    if (
      await page.evaluate(
        () =>
          (window as unknown as { mapHandoffCheck: { loadingReappeared: boolean } })
            .mapHandoffCheck.loadingReappeared,
      )
    )
      throw Error('Map loading skeleton reappeared during route navigation')
    if (!(await page.locator('[data-admin-map-outlet] canvas').isVisible()))
      throw Error('Retained map is hidden after the route transition')
    await mkdir('output/playwright', { recursive: true })
    await page.screenshot({ path: `output/playwright/admin-map-handoff-${width}.png` })
    await page.getByRole('button', { name: 'New unpinned draft', exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Read camera', exact: true }).click()
    const draftCamera = JSON.parse(await page.locator('[data-camera]').innerText())
    if (
      Math.abs(draftCamera.center[0] - 114.1) > 1e-6 ||
      Math.abs(draftCamera.zoom - 11.5) > 1e-6
    )
      throw Error('New draft did not restore its discovery camera')
    await page.getByRole('button', { name: 'Clear account', exact: true }).click()
    await page.locator('canvas.maplibregl-canvas').waitFor({ state: 'detached' })
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      `${width}: same canvas across route teardown, unchanged camera for same marker, flight to changed marker, account cleanup`,
    )
    await page.close()
  }
} finally {
  await browser.close()
}
