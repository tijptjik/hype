import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/location-flow-toolbar', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1120, 800, 390]) {
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
      await page.goto('http://127.0.0.1:4173/__rule-title.html')
      await page.getByRole('button', { name: 'Map pin', exact: true }).waitFor()
      const pin = await page
        .getByRole('button', { name: 'Map pin', exact: true })
        .boundingBox()
      const nearby = await page
        .getByRole('button', { name: 'Search Nearby', exact: true })
        .boundingBox()
      if (width > 1000 && (!pin || !nearby || Math.abs(pin.y - nearby.y) > 15))
        throw Error('Search and map-pin controls wrapped at desktop width')
      const axes = page.locator(
        '[data-search-toolbar] [data-coordinate-axis]:not([inert] *)',
      )
      if ((await axes.nth(0).inputValue()) !== '114.1525')
        throw Error('Longitude precision')
      if ((await axes.nth(1).inputValue()) !== '22.2888')
        throw Error('Latitude precision')
      await axes.nth(1).focus()
      await page.waitForFunction(
        () => (document.activeElement as HTMLInputElement)?.value === '22.288801234',
      )
      await axes.nth(1).blur()
      await page.screenshot({
        path: `output/playwright/location-flow-toolbar/${name}-${width}-before.png`,
        fullPage: true,
      })
      const display = page.locator(
        '[data-saved-toolbar] [data-address-toolbar-display]',
      )
      const scroller = display.locator('[data-overflow="true"]')
      await scroller.waitFor()
      await page.waitForFunction(() => {
        const track = document.querySelector<HTMLElement>(
          '[data-saved-toolbar] [data-overflow="true"] .bits-scrollable-text__track',
        )
        return track && !track.style.transform.includes('translate3d(0px')
      })
      const settings = page.locator(
        '[data-saved-toolbar] [data-address-toolbar-settings]',
      )
      const d = await display.boundingBox(),
        t = await settings.boundingBox()
      if (d && t && Math.abs(d.y - t.y) < 20 && d.x + d.width > t.x + 1)
        throw Error('Address overlaps settings')
      const addressSection = page.locator('[data-saved-toolbar] [data-address-details]')
      await addressSection
        .getByRole('button', { name: 'Multilingual', exact: true })
        .click()
      await page.waitForTimeout(350)
      if (width >= 800) {
        const chip = await addressSection.locator('[data-locale="en"]').boundingBox()
        if (!chip || chip.width < 25) throw Error('Expanded language chip is squeezed')
        const heading = await addressSection
          .getByRole('heading', { name: /^(Address|Location)$/ })
          .boundingBox()
        const locales = await addressSection
          .locator('[data-locale-toolbar]')
          .boundingBox()
        if (
          !heading ||
          !locales ||
          Math.abs(heading.y + heading.height / 2 - locales.y - locales.height / 2) > 5
        )
          throw Error('Address languages wrapped below heading')
      }
      const alert = await page
        .getByRole('alert')
        .filter({ hasText: 'Edit Location name' })
        .boundingBox()
      const languages = await page
        .getByRole('button', { name: 'Multilingual', exact: true })
        .last()
        .boundingBox()
      if (
        !alert ||
        !languages ||
        languages.y >= alert.y + alert.height ||
        alert.y >= languages.y + languages.height
      )
        throw Error('Save error and multilingual entry are on separate rows')
      await page.screenshot({
        fullPage: true,
        path: `output/playwright/location-flow-toolbar/${name}-${width}.png`,
      })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(`${name} ${width}: toolbar row and overflow passed`)
      if (width >= 800) {
        await page.goto('http://127.0.0.1:4173/__rule-title.html?short')
        const short = page.locator(
          '[data-saved-toolbar] [data-address-display-text] .bits-scrollable-text',
        )
        await short.waitFor()
        await page.waitForTimeout(350)
        const textBox = await short.boundingBox()
        const pane = await page.locator('[data-saved-toolbar]').boundingBox()
        if (
          !textBox ||
          !pane ||
          Math.abs(textBox.x + textBox.width / 2 - pane.x - pane.width / 2) > 2
        )
          throw Error(
            'Short address is not centered in the pane: ' +
              JSON.stringify({ textBox, pane }),
          )
        await page.screenshot({
          path: `output/playwright/location-flow-toolbar/${name}-${width}-centered.png`,
          fullPage: true,
        })
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
