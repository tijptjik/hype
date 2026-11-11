// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
await mkdir('output/playwright/selection-loading', { recursive: true })
try {
  for (const width of [1440, 900, 390])
    for (const layer of [false, true]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/__selection*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/selectionLoadingCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__selection${layer ? '?layer=1' : ''}`)
      await page.locator('[data-selection]').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const measure = () =>
        page.locator('[data-selection]').evaluateAll(nodes =>
          nodes.map(node => {
            const { x, y, width, height } = node.getBoundingClientRect()
            return { x, y, width, height }
          }),
        )
      const pending = await measure()
      await page.screenshot({
        path: `output/playwright/selection-loading/${width}-${layer}-pending.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Toggle loaded' }).click()
      await page.waitForTimeout(150)
      const ready = await measure()
      console.log(JSON.stringify({ width, layer, pending, ready }))
      assert.deepEqual(pending, ready)
      assert.deepEqual(errors, [])
      await page.close()
    }
} finally {
  await browser.close()
}
