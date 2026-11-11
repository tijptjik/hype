// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request =>
      errors.push(`${request.url()}: ${request.failure()?.errorText}`),
    )
    await page.route('**/__history-handoff.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/historyHandoffCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__history-handoff.html')
    const header = page.locator('header > [data-adaptive-toolbar-right-group]')
    const expand = header.getByRole('button', { name: 'Expand all', exact: true })
    await expand.waitFor().catch(error => {
      throw new Error(`History fixture did not render: ${errors.join('; ')}`, {
        cause: error,
      })
    })
    const original = await expand.elementHandle()
    const search = await header.getByRole('textbox').elementHandle()
    for (let index = 0; index < 4; index++) {
      await page.getByRole('button', { name: 'Begin handoff', exact: true }).click()
      assert.equal(
        await header.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(),
        true,
      )
      await page.getByRole('button', { name: 'Finish handoff', exact: true }).click()
      const label = index % 2 === 0 ? 'Collapse all' : 'Expand all'
      assert.equal(
        await header
          .getByRole('button', { name: label, exact: true })
          .evaluate((node, prior) => node === prior, original),
        true,
      )
      assert.equal(
        await header
          .getByRole('textbox')
          .evaluate((node, prior) => node === prior, search),
        true,
      )
      await header.getByRole('button', { name: 'History', exact: true }).waitFor()
    }
    assert.deepEqual(errors, [])
    console.log(
      `${name}: search and history controls retain DOM identity through repeated handoffs`,
    )
  } finally {
    await browser.close()
  }
}
