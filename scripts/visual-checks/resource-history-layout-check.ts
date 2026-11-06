// NODE
import { strict as assert } from 'node:assert'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const base = process.env.HISTORY_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-history-layout'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const [width, narrow] of [
      [1280, false],
      [390, false],
      [320, false],
      [1280, true],
    ] as const) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__history-layout.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceHistoryLayoutCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/api/images/revisions/*', route =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="16" fill="#176078"/><path d="M24 53l18 18 34-42" fill="none" stroke="#fff" stroke-width="9"/></svg>',
        }),
      )
      await page.goto(`${base}/__history-layout.html${narrow ? '?narrow' : ''}`)
      const latest = page.locator('article').filter({
        has: page.getByRole('heading', {
          name: 'Resource image updated',
          exact: true,
        }),
      })
      await latest.waitFor()
      const disclosure = latest.getByRole('button', { name: '1 changed field' })
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
      const metadata = latest.getByRole('button', { name: 'Metadata', exact: true })
      const references = latest.locator('[id^="logo-metadata-"]')
      assert.equal(await references.isVisible(), false)
      assert.equal(await metadata.getAttribute('aria-expanded'), 'false')
      const logoHeader = latest
        .getByRole('region', { name: 'Logo history' })
        .locator(':scope > div')
        .first()
      const metadataBounds = (await metadata.boundingBox())!
      const logoHeaderBounds = (await logoHeader.boundingBox())!
      assert.ok(
        logoHeaderBounds.x +
          logoHeaderBounds.width -
          metadataBounds.x -
          metadataBounds.width <
          20,
        'Metadata button must align to the right of the Logo header',
      )
      // The secondary metadata button must not collapse the enclosing revision.
      await metadata.focus()
      await page.keyboard.press('Enter')
      await references.getByText(/^upload-/).waitFor()
      assert.equal(await metadata.getAttribute('aria-expanded'), 'true')
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
      if (width === 1280 && !narrow) {
        const titleBounds = (await latest
          .locator(':scope > header > div')
          .first()
          .boundingBox())!
        const changedBounds = (await latest
          .locator(':scope > header > dl > div')
          .first()
          .boundingBox())!
        assert.ok(
          Math.abs(changedBounds.x - titleBounds.x - titleBounds.width - 32) < 2,
          'Revision metadata must follow the title with a fixed gap',
        )
        const primaryLabel = (await latest
          .getByText('Revision', { exact: true })
          .boundingBox())!
        for (const label of ['Changed', 'Actor', 'Source']) {
          const bounds = (await latest
            .locator(':scope > header')
            .getByText(label, { exact: true })
            .boundingBox())!
          assert.ok(
            Math.abs(bounds.y - primaryLabel.y) < 2,
            `${label} must share the primary header row`,
          )
        }
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      await metadata.click()
      assert.equal(await references.isVisible(), false)
      await page.getByRole('button', { name: 'Older changes', exact: true }).click()
      await page
        .getByRole('heading', { name: 'State captured before revision tracking' })
        .waitFor()
      await page.getByRole('button', { name: 'Expand', exact: true }).click()
      await page.getByText('Neighbourhood Food Collective', { exact: true }).waitFor()
      await page.getByText('社區食物共享', { exact: true }).waitFor()
      const profile = page.locator('article').filter({
        has: page.getByRole('heading', {
          name: 'Organisation form save',
          exact: true,
        }),
      })
      assert.equal(
        await profile.getByRole('region', { name: 'Logo history' }).count(),
        0,
        'Unchanged logos must not repeat on every save',
      )
      const comparison = page
        .getByRole('region', { name: 'English', exact: true })
        .locator('section')
        .first()
      const before = comparison.locator('dt').filter({ hasText: /^Before$/ })
      const after = comparison.locator('dt').filter({ hasText: /^After$/ })
      const a = (await before.boundingBox())!,
        b = (await after.boundingBox())!
      if (width >= 576 && !narrow)
        assert.ok(Math.abs(a.y - b.y) < 1, 'Wide comparisons must align')
      else assert.ok(b.y > a.y, 'Narrow panels must stack comparisons')
      const headerIcon = page.locator('.bits-header__icon-wrap').first()
      assert.ok(
        (await headerIcon.boundingBox())!.height < 40,
        'Fixture must load the themed header styles',
      )
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      await page.screenshot({
        path: `${directory}/${name}-${width}${narrow ? '-panel' : ''}.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Collapse', exact: true }).click()
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'false')
      await page.getByRole('button', { name: 'Field definitions', exact: true }).click()
      await page.getByRole('heading', { name: 'Contact options updated' }).waitFor()
      await page.getByRole('button', { name: 'Expand en', exact: true }).click()
      await page.getByText('Telegram', { exact: true }).waitFor()
      assert.equal(
        await page
          .getByRole('button', { name: '1 changed field' })
          .getAttribute('aria-expanded'),
        'true',
      )
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
console.log(
  'History layout: Chromium and Firefox desktop, mobile and narrow-panel checks passed',
)
