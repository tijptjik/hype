import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 400, height: 400 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__locale-strip.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/localeSourceStripCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://localhost:5175/__locale-strip.html')
    const next = page.getByRole('button', { name: 'Next languages', exact: true })
    const prev = page.getByRole('button', { name: 'Previous languages', exact: true })
    await next.waitFor()
    assert.equal(await prev.isDisabled(), true)
    const header = page.locator('[data-fixture-header]')
    const bounds = await header.boundingBox()
    for (let i = 0; i < 10 && (await next.isEnabled()); i++) {
      await next.click()
      await page.waitForTimeout(100)
    }
    assert.equal(await next.isDisabled(), true)
    assert.equal(await prev.isEnabled(), true)
    assert.equal(await page.locator('output').textContent(), 'none')
    await page.getByRole('button', { name: 'Translate from Es', exact: true }).click()
    assert.equal(await page.locator('output').textContent(), 'Es')
    assert.deepEqual(await header.boundingBox(), bounds)
    await page.screenshot({
      path: `output/playwright/locale-source-strip-${engine.name()}.png`,
    })
    for (let i = 0; i < 10 && (await prev.isEnabled()); i++) {
      await prev.click()
      await page.waitForTimeout(100)
    }
    assert.equal(await prev.isDisabled(), true)
    await page.setViewportSize({ width: 900, height: 400 })
    await header.evaluate(node => {
      ;(node as HTMLElement).style.width = '800px'
    })
    await next.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log(
      `${engine.name()}: overflow arrows, both ends, translation, stable layout and resize passed`,
    )
  } finally {
    await browser.close()
  }
}
