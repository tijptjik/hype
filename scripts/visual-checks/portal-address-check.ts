import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__portal-address.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/portalAddressCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__portal-address.html')
    const labels = page.locator('#app > div > span')
    await labels.first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1200)
    const lines = await labels.allTextContents()
    console.log(
      name,
      lines.map(line => line.trim()),
    )
    assert.deepEqual(
      lines.map(line => line.trim()),
      ['Shamshuipo Army', 'Camp Substation', '733 Lai Chi Kok Rd'],
    )
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 600 })
      for (const label of await labels.all()) {
        const box = (await label.boundingBox())!
        assert(box.x >= 0 && box.x + box.width <= width, JSON.stringify(box))
        assert(await label.evaluate(el => el.clientWidth <= 186))
      }
    }
    await page.setViewportSize({ width: 375, height: 600 })
    await page.screenshot({ path: `output/playwright/portal-address-${name}.png` })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
