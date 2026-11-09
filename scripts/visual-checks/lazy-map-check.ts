// PLAYWRIGHT
import { chromium } from 'playwright'
// FILESYSTEM
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const errors: string[] = []
  const mapRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/\/Maplet\.svelte(?:\?|$)|maplibre-gl/.test(request.url()))
      mapRequests.push(request.url())
  })
  // Keep rendering deterministic without external basemap or geocoding dependencies.
  await page.route('**/src/lib/map/styles/index.ts*', route => {
    if (new URL(route.request().url()).searchParams.has('lazyOriginal'))
      return route.continue()
    return route.fulfill({
      contentType: 'text/javascript',
      body: `export * from '/src/lib/map/styles/index.ts?lazyOriginal'; export const buildCatalogMapStyle=()=>({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f5eee7'}}]});`,
    })
  })
  await page.route('**/__lazy-map.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/lazyMapCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__lazy-map.html')
  await page.getByRole('button', { name: 'Toggle map' }).waitFor()
  if (mapRequests.length)
    throw new Error(`Map loaded before opening: ${mapRequests.join(', ')}`)
  await page.getByRole('button', { name: 'Toggle map' }).click()
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 60000 })
  await page.locator('[data-pin-control]').waitFor()
  if (!mapRequests.length) throw new Error('Opening the map did not load its renderer')
  await page.getByRole('button', { name: 'Move pin' }).click()
  await page.locator('[data-pin-control]').waitFor()
  await page.waitForFunction(() => {
    const pin = document.querySelector('[data-pin-control]')?.getBoundingClientRect()
    const map = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
    return (
      pin &&
      map &&
      pin.left >= map.left &&
      pin.right <= map.right &&
      pin.top >= map.top &&
      pin.bottom <= map.bottom
    )
  })
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/lazy-map.png' })
  await page.getByRole('button', { name: 'Toggle map' }).click()
  await page.locator('[data-map-ready="false"]').waitFor()
  if (await page.locator('.maplibregl-canvas').count())
    throw new Error('Map canvas survived unmount')
  await page.getByRole('button', { name: 'Toggle map' }).click()
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 60000 })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      deferredUntilOpened: true,
      rendered: true,
      pinControlsForwarded: true,
      disposed: true,
      reopened: true,
    }),
  )
} finally {
  await browser.close()
}
