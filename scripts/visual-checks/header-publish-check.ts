import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1568, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__header-publish-check.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerPublishCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__header-publish-check.html`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const save = page.getByRole('button', { name: 'Save', exact: true })
    const publish = page.getByRole('button', { name: 'Publish', exact: true })
    assert.equal(await save.isVisible(), true)
    assert.equal(await publish.isVisible(), true)
    assert.equal(await publish.isEnabled(), true)
    await publish.click()
    await page.getByRole('button', { name: 'Unpublish', exact: true }).waitFor()
    assert.equal(await save.isVisible(), true)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `/tmp/header-publish-${name}.png` })
    console.log(
      `${name}: Save and Publish render together and publication works in edit mode`,
    )
  } finally {
    await browser.close()
  }
}
