// NODE
import { mkdir } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-changelog-filters'
await mkdir(directory, { recursive: true })
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__changelog-filters.html*', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await page.goto(`${baseUrl}/__changelog-filters.html?boundaries`)
      await page.locator('details[data-change-key="first-0"]').waitFor()
      const toggle = page.getByRole('button', { name: /^Filters/ })
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      await toggle.click()
      const bar = page.getByRole('group', { name: 'Changelog filters' })
      await bar.waitFor()
      await bar.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Feature', exact: true }).click()
      await page.waitForTimeout(500)
      assert.ok(await page.locator('details').count())
      assert.ok(
        (await page.locator('details summary').allTextContents()).every(text =>
          text.includes('feature'),
        ),
      )
      await toggle.click()
      assert.equal(await bar.count(), 0)
      assert.equal(await toggle.getAttribute('aria-label'), 'Filters, 1 active')
      await toggle.click()
      await bar.getByRole('button', { name: 'Actor', exact: true }).click()
      await bar.getByRole('combobox').click()
      await page.getByRole('option', { name: 'System', exact: true }).click()
      await page.getByText('No changes match these filters.', { exact: true }).waitFor()
      await bar.getByRole('button', { name: /Reset/ }).click()
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await bar.getByRole('button', { name: 'Period', exact: true }).click()
      const from = bar.getByRole('slider', { name: 'Changes from', exact: true })
      const to = bar.getByRole('slider', { name: 'Changes to', exact: true })
      const original = Number(await from.getAttribute('aria-valuenow'))
      await from.focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Tab')
      assert.equal(Number(await from.getAttribute('aria-valuenow')), original + 1)
      assert.ok(await to.getAttribute('aria-valuetext'))
      await page.waitForTimeout(450)
      await bar.getByRole('button', { name: /Reset/ }).click()
      assert.equal(Number(await from.getAttribute('aria-valuenow')), original)
      await bar.getByRole('button', { name: 'Search', exact: true }).click()
      await bar.getByRole('searchbox').fill('does not exist')
      await page.getByText('No changes match these filters.', { exact: true }).waitFor()
      await bar.getByRole('searchbox').fill('')
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await page.getByRole('button', { name: 'Switch scope', exact: true }).click()
      await page.locator('details[data-change-key="second-0"]').waitFor()
      assert.equal(await toggle.getAttribute('aria-label'), 'Filters')
      await bar.getByRole('button', { name: 'Period', exact: true }).click()
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      )
      for (const label of ['Action', 'Category', 'Source']) {
        await bar.getByRole('button', { name: label, exact: true }).click()
        await bar.getByRole('combobox').click()
        assert.ok(await page.getByRole('option').count())
        await page.keyboard.press('Escape')
      }
      await bar.getByRole('button', { name: 'Period', exact: true }).click()
      await page.screenshot({
        path: `${directory}/${name}-${width}.png`,
        fullPage: true,
      })
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: filter toggle, combined filters, reset, period keyboard, search, scope reset and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
