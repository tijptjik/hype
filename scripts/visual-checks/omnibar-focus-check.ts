import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } })
    await page.route('**/__omnibar-focus.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/omnibarFocusCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__omnibar-focus.html`)
    const row = page.getByRole('button', { name: 'Sheung Wan signs' })
    await row.waitFor()
    const primary = await page.evaluate(() => {
      const swatch = document.createElement('span')
      swatch.className = 'text-primary'
      document.body.append(swatch)
      const color = getComputedStyle(swatch).color
      swatch.remove()
      return color
    })
    // Reach the result via Tab, then its independent action, as a keyboard user would.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    assert.equal(await row.evaluate(el => el === document.activeElement), true)
    const focused = await row.evaluate(el => ({
      color: getComputedStyle(el).color,
      shadow: getComputedStyle(el).boxShadow,
      outline: getComputedStyle(el).outlineStyle,
    }))
    assert.equal(focused.color, primary)
    assert.equal(focused.shadow, 'none')
    assert.equal(focused.outline, 'none')
    await page.screenshot({ path: `/tmp/omnibar-focus-${engine.name()}.png` })
    await page.keyboard.press('Tab')
    const control = page.getByRole('button', { name: 'Isolate layer' })
    assert.equal(await control.evaluate(el => el === document.activeElement), true)
    assert.equal(await control.evaluate(el => getComputedStyle(el).color), primary)
    const centers = await page.locator('button.group').evaluateAll(headers =>
      headers.map(header => {
        const icon = header.querySelector('svg')?.getBoundingClientRect()
        const trailing = header.parentElement
          ?.querySelector('button[aria-label] svg, span.font-mono')
          ?.getBoundingClientRect()
        return Math.abs(icon.x + icon.width / 2 - trailing.x - trailing.width / 2)
      }),
    )
    assert.ok(
      centers.every(offset => offset < 0.5),
      JSON.stringify(centers),
    )
    console.log(
      `${engine.name()}: primary keyboard focus without boxes; icons and counts aligned`,
    )
  } finally {
    await browser.close()
  }
}
