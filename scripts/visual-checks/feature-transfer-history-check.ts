// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// ASSERTIONS
import assert from 'node:assert/strict'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.route('**/__transfer-history.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureTransferHistoryCheck.ts"></script></body></html>`,
        }),
      )
      await page.goto('http://127.0.0.1:4173/__transfer-history.html')
      await page.getByText('Ghost Signs › HKGS › Current', { exact: false }).click()
      const comparison = page.getByRole('region', { name: 'Material', exact: true })
      await comparison.getByText('Glass', { exact: true }).waitFor()
      assert.equal(await page.getByText('opaque-', { exact: false }).count(), 0)
      if (width === 1440) {
        const heading = await comparison
          .getByText('Action', { exact: true })
          .boundingBox()
        const after = await comparison.getByText('After', { exact: true }).boundingBox()
        assert(
          heading && after && Math.abs(heading.x - after.x) <= 1,
          `${name}: heading and value columns must align`,
        )
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      await page.screenshot({
        path: `/tmp/feature-transfer-history-${name}-${width}.png`,
        fullPage: true,
      })
      console.log(`${name} ${width}px: readable labels, aligned columns, no overflow`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
