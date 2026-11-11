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
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__header-share-layout.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerShareLayoutCheck.ts"></script></body></html>',
      }),
    )
    for (const width of [1566, 1100, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${origin}/__header-share-layout.html`)
      const header = page.locator('header > [data-adaptive-toolbar-right-group]')
      const share = header.getByRole('button', { name: 'Share map', exact: true })
      await share.waitFor()
      await page.waitForTimeout(500)
      const before = await share.boundingBox()
      await share.click()
      await page.waitForTimeout(500)
      const after = await share.boundingBox()
      assert.ok(before && after)
      assert.ok(
        Math.abs(before.x - after.x) < 1,
        `${name} ${width}: Share moved from ${before.x} to ${after.x}`,
      )
      assert.equal(await header.getByRole('textbox').count(), 0)
      assert.equal(
        await header.getByRole('button', { name: 'Controls', exact: true }).count(),
        0,
      )
      await page.getByRole('button', { name: 'Return to resources' }).click()
      await page.waitForTimeout(500)
      const returned = await share.boundingBox()
      assert.ok(returned && Math.abs(returned.x - before.x) < 1)
      console.log(`${name} ${width}: navigation position preserved; Share slot empty`)
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
