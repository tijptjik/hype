import { chromium, firefox } from 'playwright'

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__marker-reveal.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationMarkerRevealCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/division.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export function getAddressDivisionLabel(){return {current:null}};export function getAddressDivisionContext(){return {current:null}};export function getDivisionGeometry(){return {current:null}}',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__marker-reveal.html')
      const row = page.locator('[data-search-result="place-17"]')
      await row.waitFor()
      const list = page.locator('section').filter({ has: row })
      await page.getByRole('button', { name: 'Marker 3', exact: true }).click()
      await page.locator('[data-result-actions="place-3"]').waitFor()
      await page.waitForTimeout(700)
      if ((await list.evaluate(el => el.scrollTop)) !== 0)
        throw Error('Visible row moved')
      await page.getByRole('button', { name: 'Marker 17', exact: true }).click()
      await page.locator('[data-result-actions="place-17"]').waitFor()
      await page.waitForTimeout(100)
      const intermediate = await list.evaluate(el => el.scrollTop)
      await page.waitForTimeout(900)
      const settled = await list.evaluate(el => el.scrollTop)
      if (!(intermediate > 0 && intermediate < settled))
        throw Error('Reveal did not animate')
      const bounds = await row.boundingBox(),
        viewport = await list.boundingBox()
      if (
        !bounds ||
        !viewport ||
        Math.abs(bounds.y + bounds.height / 2 - viewport.y - viewport.height / 2) > 2
      )
        throw Error('Offscreen row was not centered')
      if ((await row.getAttribute('data-highlighted')) !== 'true')
        throw Error('Row not highlighted')
      await page.getByRole('button', { name: 'Marker 17', exact: true }).click()
      await page.waitForTimeout(700)
      if ((await list.evaluate(el => el.scrollTop)) !== settled)
        throw Error('Visible selection moved')
      await page.getByRole('button', { name: 'Marker 1', exact: true }).click()
      await page.waitForTimeout(900)
      if ((await list.evaluate(el => el.scrollTop)) !== 0)
        throw Error('Upward reveal failed')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.getByRole('button', { name: 'Marker 25', exact: true }).click()
      await page.locator('[data-result-actions="place-25"]').waitFor()
      await page.waitForFunction(() => {
        const row = document.querySelector('[data-search-result="place-25"]')
        const list = row?.closest('section')
        return (
          row &&
          list &&
          row.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1
        )
      })
      const last = page.locator('[data-search-result="place-25"]')
      const lastBounds = await last.boundingBox()
      if (
        !lastBounds ||
        !viewport ||
        lastBounds.y + lastBounds.height > viewport.y + viewport.height + 1
      )
        throw Error('Final row not revealed with reduced motion')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        `${name} ${width}: visible rows stable; smooth centered reveal, upward/end bounds and reduced motion passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
