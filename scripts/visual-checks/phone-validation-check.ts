import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } })
    page.on('pageerror', error => console.error(error.message))
    await page.route('**/__phone-validation.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/phoneValidationCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__phone-validation.html')
    const invalid = page.locator('#shared-1')
    await invalid.waitFor()
    await invalid.focus()
    await invalid.dispatchEvent('invalid')
    await page.locator('.bits-form__field--error').waitFor()
    assert.equal(await page.locator('.bits-form__field--error').count(), 1)
    await invalid.fill('+31413379222')
    await page.getByRole('button', { name: 'Next field' }).click()
    await page.waitForFunction(
      () => !document.querySelector('.bits-form__field--error'),
    )
    console.log(
      `${engine.name()}: invalid row highlighted and cleared after correction`,
    )
  } finally {
    await browser.close()
  }
}
