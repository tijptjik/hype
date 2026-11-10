import { chromium, firefox } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/staff', { recursive: true })
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/__staff-check.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/staffLayoutCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:5175/__staff-check.html')
      await page.getByText('Robin Other', { exact: true }).first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const ownerCheckbox = page.getByRole('checkbox').first()
      assert(await ownerCheckbox.isDisabled())
      assert.equal(await ownerCheckbox.getAttribute('data-state'), 'checked')
      const checkbox = page.getByRole('checkbox').last()
      await checkbox.click()
      assert.equal(await checkbox.getAttribute('data-state'), 'checked')
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Horizontal overflow',
      )
      await page.screenshot({
        path: `output/playwright/staff/${engine.name()}-${width}.png`,
      })
      assert.deepEqual(errors, [])
      console.log(
        `${engine.name()} ${width}: staff and analytics visible, checkbox interactive, no overflow`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
