// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const browser = await chromium.launch()
await mkdir('output/playwright/capabilities-loading', { recursive: true })
try {
  for (const width of [1560, 900, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__capabilities-check', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/capabilitiesLoadingCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__capabilities-check')
    await page.getByText('Capability I18n', { exact: true }).waitFor()
    await page.waitForTimeout(150)
    const measure = () =>
      page.locator('[data-content] .bits-form__section-header').evaluateAll(nodes =>
        nodes.map(node => {
          const { x, y, width, height } = node.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
    const pending = await measure()
    await page.screenshot({
      path: `output/playwright/capabilities-loading/${width}-pending.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Toggle loaded' }).click()
    await page.getByText('Donor Manager', { exact: true }).first().waitFor()
    await page.waitForTimeout(150)
    const ready = await measure()
    console.log(JSON.stringify({ width, pending, ready }))
    assert.equal(pending.length, 3)
    assert.deepEqual(pending, ready)
    assert.deepEqual(errors, [])
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    await page.screenshot({
      path: `output/playwright/capabilities-loading/${width}-ready.png`,
      fullPage: true,
    })
    await page.close()
  }
} finally {
  await browser.close()
}
