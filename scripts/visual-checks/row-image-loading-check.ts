import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
    const requests = new Set<string>()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    // Hold every thumbnail open to verify interaction without a single loaded image.
    await page.route('**/__slow-row-image/**', route => {
      requests.add(route.request().url())
    })
    await page.route('**/__row-image-loading.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/rowImageLoadingCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__row-image-loading.html`, {
      waitUntil: 'domcontentloaded',
    })
    const row = page.locator('[data-entity-id="task-0"]')
    await row.waitFor()
    await page.waitForFunction(() => document.querySelectorAll('img').length === 80)
    await page.waitForTimeout(300)
    assert(
      requests.size > 0 && requests.size < 80,
      `Expected deferred offscreen requests, got ${requests.size}`,
    )
    assert.equal(
      await row.locator('img').evaluate(image => (image as HTMLImageElement).complete),
      false,
    )
    await row.getByText('Task 0', { exact: true }).first().click({ timeout: 2000 })
    await row.locator('button').first().click({ timeout: 2000 })
    await row.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.getByLabel('Opened tasks').textContent(), '3')
    assert.deepEqual(errors, [])
    console.log(
      `${name}: title, thumbnail and keyboard work with all images pending; ${requests.size}/80 image requests started`,
    )
  } finally {
    await browser.close()
  }
}
