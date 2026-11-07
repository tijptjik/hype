// NODE
import { strict as assert } from 'node:assert'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const base = process.env.HISTORY_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/history-summary'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1280, 960, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__history-summary.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/historyLocalesCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${base}/__history-summary.html`)
      const history = page.getByRole('region', {
        name: 'Publication history',
        exact: true,
      })
      await history
        .getByRole('heading', { name: 'Gallery edited', exact: true })
        .waitFor()
      const headers = history.locator('article > header')
      assert.equal(await headers.count(), 3)
      for (const label of ['Changed', 'Actor', 'Source']) {
        const bounds = await Promise.all(
          (await headers.all()).map(header =>
            header
              .locator('dt')
              .filter({ hasText: new RegExp(`^${label}$`) })
              .boundingBox(),
          ),
        )
        assert.ok(
          bounds.every(box => box && Math.abs(box.x - bounds[0]!.x) < 1),
          `${label} must align across short and long reasons at ${width}px`,
        )
      }
      const buttons = await Promise.all(
        (
          await headers.getByRole('button', { name: 'View changes', exact: true }).all()
        ).map(button => button.boundingBox()),
      )
      assert.ok(
        buttons.every(
          box =>
            box && Math.abs(box.x + box.width - buttons[0]!.x - buttons[0]!.width) < 1,
        ),
        'Disclosure controls must align',
      )
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Page must not overflow',
      )
      // Open unequal field labels and verify their secondary headers share column tracks.
      for (const header of await headers.all()) {
        await header.getByRole('button', { name: 'View changes', exact: true }).click()
      }
      await history.getByRole('table').first().waitFor()
      const actions = history
        .locator('section > dl')
        .filter({ has: page.locator('dt').filter({ hasText: /^Action$/ }) })
      const actionBounds = await Promise.all(
        (await actions.all()).map(heading =>
          heading
            .locator('dt')
            .filter({ hasText: /^Action$/ })
            .boundingBox(),
        ),
      )
      assert.equal(actionBounds.length, 6)
      assert.ok(
        actionBounds.every(box => box && Math.abs(box.x - actionBounds[0]!.x) < 1),
        'Secondary Action columns must align across field labels',
      )
      assert.deepEqual(errors, [])
      await history.screenshot({ path: `${directory}/${name}-${width}.png` })
      console.log(
        `${name} ${width}: aligned metadata and disclosures, no overflow or runtime errors`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
