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
  if (
    process.env.CHANGELOG_CHECK_BROWSER &&
    process.env.CHANGELOG_CHECK_BROWSER !== name
  )
    continue
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
      const headingBounds = await page
        .locator('.bits-form__section-header-left')
        .boundingBox()
      const toggleBounds = await toggle.boundingBox()
      assert.ok(
        headingBounds &&
          toggleBounds &&
          headingBounds.x + headingBounds.width <= toggleBounds.x,
        'Changelog heading must not overlap its filter action',
      )
      const bar = page.getByRole('group', { name: 'Changelog filters' })
      await bar.waitFor()
      const menuTrigger = bar.locator('.bits-resource-filter-bar__filter-trigger')
      /** Open a section through the shared same-row filter menu.
       * @param label Section label.
       * @returns Completion when its inline controls are available.
       */
      async function selectSection(label: string): Promise<void> {
        if ((await menuTrigger.getAttribute('aria-expanded')) === 'false')
          await menuTrigger.click()
        await bar
          .getByRole('button', { name: new RegExp(`^${label}(, active filter)?$`) })
          .last()
          .click()
      }
      assert.equal(await menuTrigger.innerText(), 'Filter By')
      assert.equal((await bar.boundingBox())?.height, 64)
      const sectionBounds = await bar
        .locator('button[aria-pressed]')
        .evaluateAll(elements =>
          elements.map(element => element.getBoundingClientRect().y),
        )
      assert.equal(
        new Set(sectionBounds).size,
        1,
        'Filter sections must occupy one row',
      )
      await page.screenshot({
        path: `${directory}/${name}-${width}-menu.png`,
        fullPage: true,
      })
      await selectSection('Resource type')
      assert.equal((await bar.boundingBox())?.height, 64)
      await bar.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Feature', exact: true }).click()
      await page.waitForTimeout(500)
      assert.ok(await page.locator('details').count())
      assert.ok(
        (
          await page.locator('details[data-change-key] > summary').allTextContents()
        ).every(text => text.includes('feature')),
      )
      await toggle.click()
      assert.equal(await bar.count(), 0)
      assert.equal(await toggle.getAttribute('aria-label'), 'Filters, 1 active')
      await toggle.click()
      await selectSection('Actor')
      await bar.getByRole('button', { name: 'Search actors', exact: true }).click()
      const actorSearch = page.getByPlaceholder('Search actors by name or username')
      await actorSearch.fill('system')
      await page
        .locator('[data-search-result-item]')
        .filter({ hasText: 'System' })
        .click()
      await page.getByText('No changes match these filters.', { exact: true }).waitFor()
      await bar.getByRole('button', { name: /Reset/ }).click()
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await selectSection('Actor')
      await bar.getByRole('button', { name: 'Search actors', exact: true }).click()
      await actorSearch.fill('original contributor')
      await page
        .locator('[data-search-result-item]')
        .filter({ hasText: '@Original.User' })
        .waitFor()
      await page.waitForFunction(() => {
        const results = document.querySelectorAll('[data-search-result-item]')
        return (
          results.length === 1 && results[0].textContent?.includes('@Original.User')
        )
      })
      await actorSearch.press('Tab')
      await page.keyboard.press('Enter')
      await page
        .getByRole('button', { name: 'Change actor: @Original.User', exact: true })
        .waitFor()
      await page.waitForTimeout(500)
      const summaries = await page
        .locator('details[data-change-key] > summary')
        .allTextContents()
      if (!summaries.every(text => text.includes('@Original.User'))) {
        await page.screenshot({
          path: `${directory}/${name}-${width}-actor-failure.png`,
          fullPage: true,
        })
        console.log(JSON.stringify({ summaries, selected: await bar.innerText() }))
      }
      assert.ok(summaries.every(text => text.includes('@Original.User')))
      await bar.getByRole('button', { name: 'Clear actor', exact: true }).click()
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await bar.getByRole('button', { name: 'Search actors', exact: true }).click()
      await actorSearch.fill('no-such-user')
      await page
        .getByText('No matching actors in this changelog.', { exact: true })
        .waitFor()
      await actorSearch.press('Escape')
      await actorSearch.press('Escape')
      await selectSection('Period')
      const from = bar.getByRole('slider', { name: 'Changes from', exact: true })
      const to = bar.getByRole('slider', { name: 'Changes to', exact: true })
      const now = new Date()
      const day = 86400000
      const startOfWeek = Math.floor(now.getTime() / day) - ((now.getUTCDay() + 6) % 7)
      const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / day
      const shortcuts = [
        ['This week', startOfWeek, startOfWeek + 6],
        ['Previous week', startOfWeek - 7, startOfWeek - 1],
        [
          'This month',
          startOfMonth,
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / day - 1,
        ],
        [
          'Previous month',
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) / day,
          startOfMonth - 1,
        ],
      ] as const
      for (const [label, start, end] of shortcuts) {
        const shortcut = bar.getByRole('button', { name: label, exact: true })
        await shortcut.click()
        assert.equal(await shortcut.getAttribute('aria-pressed'), 'true')
        assert.equal(Number(await from.getAttribute('aria-valuenow')), start)
        assert.equal(Number(await to.getAttribute('aria-valuenow')), end)
      }
      await bar.getByRole('button', { name: /Reset/ }).click()
      const original = Number(await from.getAttribute('aria-valuenow'))
      await from.focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Tab')
      assert.equal(Number(await from.getAttribute('aria-valuenow')), original + 1)
      assert.ok(await to.getAttribute('aria-valuetext'))
      await page.waitForTimeout(450)
      await bar.getByRole('button', { name: /Reset/ }).click()
      assert.equal(Number(await from.getAttribute('aria-valuenow')), original)
      assert.equal(
        await bar.getByRole('button', { name: 'Search', exact: true }).count(),
        0,
      )
      const headerSearch = page
        .locator('.bits-pattern-header-stack')
        .getByRole('textbox', { name: 'Filter', exact: true })
      await headerSearch.fill('does not exist')
      await page.getByText('No changes match these filters.', { exact: true }).waitFor()
      await headerSearch.fill('')
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await page.getByRole('button', { name: 'Switch scope', exact: true }).click()
      await page.locator('details[data-change-key="second-0"]').waitFor()
      assert.equal(await toggle.getAttribute('aria-label'), 'Filters')
      await selectSection('Period')
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      )
      for (const label of ['Action', 'Category', 'Source']) {
        await selectSection(label)
        await bar.getByRole('combobox').click()
        assert.ok(await page.getByRole('option').count())
        await page.keyboard.press('Escape')
      }
      await selectSection('Period')
      await page.screenshot({
        path: `${directory}/${name}-${width}.png`,
        fullPage: true,
      })
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: shared header search, actor name/handle search, keyboard selection, reset, period, scope and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
