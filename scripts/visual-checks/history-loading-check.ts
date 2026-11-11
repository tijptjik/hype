// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const browser = await chromium.launch()
await mkdir('output/playwright/history-loading', { recursive: true })
try {
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__history-check', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/historyLoadingCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__history-check')
    await page.locator('[data-history] article').first().waitFor()
    const measure = () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector(selector)
          if (!node) throw new Error(selector)
          const { x, y, width, height } = node.getBoundingClientRect()
          return { x, y, width, height }
        }
        return {
          tabs: rect('[data-history] fieldset'),
          card: rect('[data-history] article'),
          summary: rect('[data-history] article > header'),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
    const deferred = await measure()
    await page.screenshot({
      path: `output/playwright/history-loading/${width}-pending.png`,
    })
    await page.getByRole('button', { name: 'Load module' }).click()
    await page.waitForTimeout(100)
    const pending = await measure()
    assert.deepEqual(pending, deferred)
    await page.getByRole('button', { name: 'Load records' }).click()
    await page.getByRole('heading', { name: 'Profile and settings updated' }).waitFor()
    const ready = await measure()
    assert.equal(ready.card.x, pending.card.x)
    assert.equal(ready.card.y, pending.card.y)
    assert.equal(ready.card.width, pending.card.width)
    assert.deepEqual(ready.tabs, pending.tabs)
    assert.equal(ready.summary.height, pending.summary.height)
    assert.equal(ready.overflow, false)
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `output/playwright/history-loading/${width}-ready.png`,
    })
    console.log(JSON.stringify({ width, deferred, pending, ready }))
    await page.close()
  }
} finally {
  await browser.close()
}
