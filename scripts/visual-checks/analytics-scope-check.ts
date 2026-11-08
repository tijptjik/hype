// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/analytics-scope'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__analytics-scope.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/analyticsScopeCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__analytics-scope.html`)
      const toolbar = page
        .locator('[data-analytics-toolbar]:visible')
        .filter({ visible: true })
        .last()
      await toolbar.waitFor()
      assert.equal(await toolbar.locator('svg').count(), 5)
      const controls = await toolbar.locator('select, button').evaluateAll(elements =>
        elements.map(element => {
          const rect = element.getBoundingClientRect()
          return { center: rect.y + rect.height / 2, height: rect.height }
        }),
      )
      assert.ok(
        controls.every(
          control =>
            Math.abs(control.center - controls[0].center) < 2 && control.height === 36,
        ),
        'Header controls must share one row and height',
      )
      await toolbar
        .getByLabel('Hostname', { exact: true })
        .selectOption('hkghostsigns.com')
      assert.equal(
        await toolbar.getByLabel('Hostname', { exact: true }).inputValue(),
        'hkghostsigns.com',
      )
      assert.equal(await page.getByText(/Counts visits to resource pages/).count(), 0)
      await toolbar.getByRole('button', { name: 'About this analytics view' }).click()
      await page
        .getByRole('tooltip')
        .filter({ hasText: 'Activity within shared maps cannot be attributed' })
        .waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      await page.screenshot({
        path: `${output}/${name}-${width}-project.png`,
        fullPage: true,
      })
      await toolbar.getByLabel('Perspective').selectOption('organisation:o')
      await page
        .getByLabel('Selected scope')
        .filter({ hasText: 'organisation:o' })
        .waitFor()
      const grant = page.getByRole('checkbox', { name: /View analytics/ })
      await grant.click()
      assert.equal(await page.getByLabel('Delegated access').textContent(), 'Granted')
      await grant.click()
      assert.equal(await page.getByLabel('Delegated access').textContent(), 'Revoked')
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Analytics overflows narrow viewport',
      )
      assert.deepEqual(errors, [])
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
console.log(
  'Analytics scope picker, delegation toggle and layout passed in Chromium and Firefox at 1440, 390 and 320px.',
)
