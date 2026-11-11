// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch()
await mkdir('output/playwright/field-loading', { recursive: true })
try {
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1100 },
      reducedMotion: 'reduce',
    })
    await page.route('**/__field-loading', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldEditorCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__field-loading`)
    await page.locator('.bits-project-field-card').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.getByRole('button', { name: 'Toggle editing' }).click()
    await page.waitForTimeout(300)
    const measure = () =>
      page
        .locator('.bits-form__section-header, .bits-project-field-card')
        .evaluateAll(nodes =>
          nodes.map(node => {
            const { x, y, width, height } = node.getBoundingClientRect()
            return { x, y, width, height }
          }),
        )
    const ready = await measure()
    await page.getByRole('button', { name: 'Toggle loading' }).click()
    await page.waitForTimeout(300)
    const pending = await measure()
    await page.screenshot({
      path: `output/playwright/field-loading/${width}.png`,
      fullPage: true,
    })
    console.log(JSON.stringify({ width, ready, pending }))
    assert.deepEqual(pending, ready)
    await page.close()
  }
} finally {
  await browser.close()
}
