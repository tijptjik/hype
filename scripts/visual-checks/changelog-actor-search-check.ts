// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__actor-search.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/changelogActorSearchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__actor-search.html`)
    await page.getByRole('button', { name: 'Search actors', exact: true }).click()
    const input = page.getByPlaceholder('Search actors by name or username')
    await input.fill('example')
    const result = page.getByRole('button', { name: /Example editor.*Example.Editor/ })
    await result.waitFor()
    const layout = await result.evaluate(element => {
      const results = element.closest('.bits-search__results-wrapper')!
      const root = element.closest('.bits-search')!
      return {
        position: getComputedStyle(results).position,
        width: results.getBoundingClientRect().width,
        rootWidth: root.getBoundingClientRect().width,
      }
    })
    assert.equal(layout.position, 'static')
    assert.ok(layout.width <= layout.rootWidth + 1)
    await input.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => document.querySelector('[data-selected]')?.textContent === 'editor',
    )
    await page.getByRole('button', { name: 'Clear actor', exact: true }).click()
    assert.equal(await page.locator('[data-selected]').innerText(), 'none')
    assert.deepEqual(errors, [])
    console.log(`${name}: inline actor search, keyboard selection and clear passed`)
  } finally {
    await browser.close()
  }
}
