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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__header-navigation-check.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerNavigationCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__header-navigation-check.html`)
    const header = page.locator('header > [data-adaptive-toolbar-right-group]')
    for (let iteration = 0; iteration < 3; iteration++) {
      // Optional disabled flags must still leave valid navigation actions enabled.
      await header.getByRole('button', { name: 'Features', exact: true }).waitFor()
      assert.equal(
        await header.getByRole('button', { name: 'Features', exact: true }).isEnabled(),
        true,
      )
      assert.equal(
        await header.getByRole('button', { name: 'Edit', exact: true }).isDisabled(),
        true,
      )
      await page.getByRole('button', { name: 'Open index', exact: true }).click()
      await page.locator('header').waitFor({ state: 'detached' })
      await page.getByRole('heading', { name: 'Organizations', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Open images', exact: true }).click()
    }
    assert.deepEqual(errors, [])
    console.log(
      `${name}: repeated header teardown, return and action availability passed`,
    )
  } finally {
    await browser.close()
  }
}
