// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'

const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/changelogCoordinateCheck.ts"></script></body></html>'
const browser = await chromium.launch({ args: ['--disable-web-security'] })
await mkdir('output/playwright/changelog-coordinates', { recursive: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__coordinate-check', route =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await page.goto('http://127.0.0.1:4173/__coordinate-check')
    await page.locator('.maplibregl-marker').first().waitFor({ timeout: 60000 })
    assert.equal(await page.locator('.maplibregl-marker').count(), 2)
    await page.waitForTimeout(3000)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `output/playwright/changelog-coordinates/${width}.png`,
      fullPage: true,
    })
    console.log(`Coordinate maps rendered at ${width}px`)
    await page.close()
  }
} finally {
  await browser.close()
}
