// PLAYWRIGHT
import { chromium } from 'playwright'
// FILESYSTEM
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  await mkdir('output/playwright', { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1050, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.route('**/src/lib/map/styles/index.ts*', route => {
    if (new URL(route.request().url()).searchParams.has('flowOriginal'))
      return route.continue()
    return route.fulfill({
      contentType: 'text/javascript',
      body: `export * from '/src/lib/map/styles/index.ts?flowOriginal'; export const buildCatalogMapStyle=()=>({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f5eee7'}}]});`,
    })
  })
  await page.route('**/src/lib/api/external/geocoding.ts*', route => {
    if (new URL(route.request().url()).searchParams.has('flowOriginal'))
      return route.continue()
    return route.fulfill({
      contentType: 'text/javascript',
      body: `export * from '/src/lib/api/external/geocoding.ts?flowOriginal'; export async function geocodeAddressCandidates(){throw new Error('fixture provider unavailable')}`,
    })
  })
  await page.route('**/__location-flow.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationFlowCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__location-flow.html')
  /** Verify the physical marker through the live camera, rather than only its state payload.
   * @param point Expected WGS84 marker destination. @returns Completion once the rendered position agrees.
   */
  async function assertRendered(point: [number, number]): Promise<void> {
    await page.waitForFunction((point: number[]) => {
      const state = document.querySelector('[data-location-flow]')!,
        camera = JSON.parse(state.getAttribute('data-camera')!)
      const marker = document.querySelector(
          '[data-location-candidate="address:fixture-17"]',
        )!,
        map = document.querySelector('[data-map-region]')!
      if (!camera || !marker || !map) return false
      const scale = 512 * 2 ** camera.zoom
      const project = (p: number[]) => [
        ((p[0] + 180) / 360) * scale,
        ((1 - Math.asinh(Math.tan((p[1] * Math.PI) / 180)) / Math.PI) / 2) * scale,
      ]
      const projected = project(point),
        center = project(camera.center),
        b = marker.getBoundingClientRect(),
        m = map.getBoundingClientRect()
      return (
        Math.abs(b.x + b.width / 2 - (m.x + m.width / 2 + projected[0] - center[0])) <
          4 &&
        Math.abs(b.y + b.height / 2 - (m.y + m.height / 2 + projected[1] - center[1])) <
          4
      )
    }, point)
  }
  const row = page.locator('[data-result-id="address:fixture-17"]')
  await row.waitFor()
  await page.locator('[data-location-candidate="address:fixture-17"]').waitFor()
  const list = row.locator('xpath=ancestor::section[1]')
  await row.scrollIntoViewIfNeeded()
  const beforeFocus = await list.evaluate(element => element.scrollTop)
  const box = await row.boundingBox()
  if (!box) throw Error('Missing row bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  if ((await list.evaluate(element => element.scrollTop)) !== beforeFocus)
    throw Error('Pointer focus scrolled before the click completed')
  await page.mouse.up()
  const actions = page.locator('[data-result-actions="address:fixture-17"]')
  await actions.waitFor()
  await page.waitForFunction(() => {
    const row = document.querySelector('[data-search-result="address:fixture-17"]')!
    const list = row.closest('section')!
    const r = row.getBoundingClientRect(),
      l = list.getBoundingClientRect()
    return r.top >= l.top - 1 && r.bottom <= l.bottom + 1
  })
  await page.screenshot({
    path: 'output/playwright/location-flow-row-actions.png',
    fullPage: true,
    animations: 'disabled',
  })
  const info = row.locator('.bits-tooltip__trigger')
  await info.hover()
  await page.locator('.bits-tooltip__content').waitFor()
  await info.click()
  await list.evaluate(element => (element.scrollTop += 80))
  await page.locator('.bits-tooltip__content').waitFor({ state: 'hidden' })
  await actions.getByRole('button', { name: 'Use location only', exact: true }).click()
  const state = page.locator('[data-location-flow]')
  await page.getByRole('button', { name: 'Move selected pin' }).click()
  await page.getByRole('button', { name: 'Cancel move and return marker' }).click()
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector('[data-location-flow]')!.getAttribute('data-address')!,
      ).coordinates[0] === 114.152,
  )
  await assertRendered([114.152, 22.2835])
  await page.getByRole('button', { name: 'Move selected pin' }).click()
  await page.getByRole('button', { name: 'Accept Change', exact: true }).click()
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector('[data-location-flow]')!.getAttribute('data-address')!,
      ).source.authored.i18n.en.buildingNumberExpression === '77-81',
  )
  const markers = JSON.parse((await state.getAttribute('data-markers')) ?? '[]')
  const selected = markers.find((marker: { selected?: boolean }) => marker.selected)
  if (
    selected.number !== 17 ||
    selected.coordinates[0] !== 114.153 ||
    selected.coordinates[1] !== 22.283
  )
    throw Error(`Selected marker did not move: ${JSON.stringify(selected)}`)
  await page.waitForFunction(() => {
    const state = document.querySelector('[data-location-flow]')!
    const camera = JSON.parse(state.getAttribute('data-camera')!)
    return camera?.zoom > 0
  })
  await assertRendered([114.153, 22.283])
  await page.screenshot({
    path: 'output/playwright/location-flow-accepted.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.reload()
  const mobileRow = page.locator('[data-result-id="address:fixture-17"]')
  await mobileRow.waitFor()
  await mobileRow.scrollIntoViewIfNeeded()
  await mobileRow.click()
  const mobileActions = page.locator('[data-result-actions="address:fixture-17"]')
  await mobileActions.waitFor()
  await page.waitForFunction(() => {
    const actions = document.querySelector(
        '[data-result-actions="address:fixture-17"]',
      )!,
      list = actions.closest('section')!
    const a = actions.getBoundingClientRect(),
      l = list.getBoundingClientRect()
    return (
      a.left >= l.left - 1 &&
      a.right <= l.right + 1 &&
      a.top >= l.top - 1 &&
      a.bottom <= l.bottom + 1
    )
  })
  await page.screenshot({
    path: 'output/playwright/location-flow-mobile-actions.png',
    fullPage: true,
    animations: 'disabled',
  })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      pointerSelection: true,
      actionsVisible: true,
      scrollDismissesTooltip: true,
      cancelRestoresMarker: true,
      offlineCustomAddress: true,
      selectedNumber: selected.number,
      selectedCoordinates: selected.coordinates,
      renderedMarkerProjection: true,
      mobileActionsVisible: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
