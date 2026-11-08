import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__mobile-attribution.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/mobileAttributionCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(
      `${process.env.HYPE_CHECK_ORIGIN ?? 'http://[::1]:5175'}/__mobile-attribution.html`,
    )
    const trigger = page.getByRole('button', { name: 'Attribution and image details' })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await page.getByRole('button', { name: 'Open image metadata' }).click()
    await page.waitForTimeout(300)
    for (const width of [320, 390, 639]) {
      await page.setViewportSize({ width, height: 700 })
      await page.waitForTimeout(200)
      const panel = await dialog.boundingBox()
      const viewer = await page.locator('[data-viewer]').boundingBox()
      const body = await page.locator('[data-body]').boundingBox()
      assert(panel && viewer && body)
      assert(Math.abs(panel.width - viewer.width) < 1)
      assert(Math.abs(panel.y - viewer.y) < 1)
      assert(body.y >= panel.y + panel.height - 1)
      assert.equal(
        await dialog.evaluate(el => el.scrollHeight <= el.clientHeight + 1),
        true,
      )
      assert.equal(await trigger.getAttribute('data-tooltip'), null)
    }
    await page.screenshot({
      path: `output/playwright/mobile-attribution-${name}.png`,
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    assert.equal(await dialog.count(), 0)
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
    assert.equal((await page.locator('[data-viewer]').boundingBox())?.height, 320)
    await page.setViewportSize({ width: 900, height: 800 })
    await page.waitForTimeout(200)
    await trigger.click()
    await page.waitForTimeout(250)
    assert.equal(Math.round((await dialog.boundingBox())!.width), 320)
    assert.equal((await page.locator('[data-viewer]').boundingBox())?.height, 320)
    assert.deepEqual(errors, [])
    console.log(
      `${name}: mobile fill, content growth, body placement, Escape/focus and desktop popover passed`,
    )
  } finally {
    await browser.close()
  }
}
