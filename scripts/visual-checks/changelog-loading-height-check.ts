// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.route('**/__loading-height*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__loading-height?slow=1')
    await page.locator('[data-changelog-skeleton-row]').first().waitFor()
    await page.waitForFunction(() => {
      const list = document.querySelector('[data-changelog-skeletons]')
      if (!list?.parentElement) return false
      return list.getBoundingClientRect().height >= list.parentElement.clientHeight
    })
    const geometry = await page.locator('[data-changelog-skeletons]').evaluate(list => {
      const viewport = list.parentElement
      if (!viewport) throw new Error('Missing loading viewport')
      const row = list.querySelector('[data-changelog-skeleton-row]')
      if (!row) throw new Error('Missing loading row')
      return {
        rows: list.querySelectorAll('[data-changelog-skeleton-row]').length,
        filled: list.getBoundingClientRect().height,
        available: viewport.clientHeight,
        rowHeight: row.getBoundingClientRect().height,
      }
    })
    assert.ok(geometry.filled >= geometry.available)
    assert.ok(geometry.filled - geometry.available < geometry.rowHeight)
    console.log(JSON.stringify({ width, ...geometry }))
    await page.close()
  }
} finally {
  await browser.close()
}
