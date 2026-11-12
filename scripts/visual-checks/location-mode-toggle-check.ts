import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/location-mode-toggle', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 1000, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__rule-title.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationFlowToolbarCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/division.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export function getAddressDivisionLabel(){return {current:null}};export function getAddressDivisionContext(){return {current:null}};export function getDivisionGeometry(){return {current:null}}',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__rule-title.html?no-coordinates')
      const toggle = page.getByRole('button', { name: 'Map pin', exact: true })
      const nearby = page.getByRole('button', { name: 'Search Nearby', exact: true })
      await nearby.waitFor()
      const pinBox = await toggle.boundingBox()
      const nearbyBox = await nearby.boundingBox()
      await page.getByRole('button', { name: /Find by.*Search/i }).click()
      const searchBox = await toggle.boundingBox()
      if (
        width >= 1000 &&
        (!pinBox ||
          !searchBox ||
          Math.abs(pinBox.x - searchBox.x) > 1 ||
          Math.abs(pinBox.y - searchBox.y) > 1)
      )
        throw Error(
          'Toggle moved between modes: ' + JSON.stringify({ pinBox, searchBox }),
        )
      await toggle.click()
      const filter = page.getByRole('textbox', { name: 'Filter nearby results' })
      if (!(await filter.isDisabled()))
        throw Error('Nearby filter enabled before search')
      const filterBox = await filter.boundingBox()
      if (
        width >= 1000 &&
        (!nearbyBox || nearbyBox.width < 100 || !filterBox || filterBox.width < 150)
      )
        throw Error('Nearby controls are squeezed')
      await page.screenshot({
        path: `output/playwright/location-mode-toggle/${name}-${width}.png`,
      })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        `${name} ${width}: stationary toggle and disabled nearby filter passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
