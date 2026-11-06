// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Locator } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/capability-labels'

/** Read a value without depending on layout-specific whitespace.
 * @param locator Visible field value or callback output.
 * @returns Trimmed DOM text.
 */
async function text(locator: Locator): Promise<string> {
  return (await locator.textContent())?.trim() ?? ''
}
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 2560, 800, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__capability-labels.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/capabilityLabelsCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__capability-labels.html`)
      const grid = page.locator('[data-capability-labels]')
      await grid.waitFor()
      const fields = grid.locator('[data-capability-field]')
      const multilingual = page.getByRole('button', {
        name: 'Multilingual',
        exact: true,
      })
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'false')
      assert.equal(await fields.count(), 3)
      assert.equal(await fields.first().locator('[data-capability-locale]').count(), 3)
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale][aria-hidden="false"]')
          .count(),
        1,
      )
      assert.equal(
        await grid
          .locator('[data-capability-locale="en"] [data-inline-locale-row] > span')
          .first()
          .textContent(),
        '',
      )
      assert.equal(
        await page.locator('[data-locale-code]').count(),
        0,
        'Use the shared multilingual toolbar instead of target-locale buttons',
      )
      assert.equal(
        await grid.getByRole('button').count(),
        0,
        'Read mode must show selectable labels',
      )
      /** Count the rendered tracks rather than relying on the CSS class names.
       * @returns Number of rendered capability columns.
       */
      const columnCount = (): Promise<number> =>
        grid.evaluate(
          element => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        )
      const narrowColumns = width >= 640 ? 2 : 1
      assert.equal(await columnCount(), width >= 1024 ? 3 : narrowColumns)
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Read mode overflows',
      )
      await page.screenshot({
        path: `${output}/${name}-${width}-collapsed.png`,
        fullPage: true,
      })
      await multilingual.click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'true')
      assert.equal(
        await page.getByRole('button', { name: 'Add', exact: true }).count(),
        0,
        'Add language is edit-only',
      )
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale][aria-hidden="false"]')
          .count(),
        3,
      )
      assert.equal(
        await grid
          .locator('[data-capability-locale="en"] [data-inline-locale-row] > span')
          .first()
          .textContent(),
        '',
      )
      assert.equal(
        await grid
          .locator('[data-capability-locale="zhHant"] [data-inline-locale-row] > span')
          .first()
          .textContent(),
        '繁中',
      )
      const chineseChip = page.locator('[data-locale-toolbar] [data-locale="zh-Hant"]')
      await chineseChip.click()
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale="zhHant"]')
          .getAttribute('aria-hidden'),
        'true',
      )
      assert.equal(
        await fields.first().locator('input').count(),
        3,
        'Hidden locales must retain registered form controls',
      )
      await chineseChip.click()
      await page.screenshot({
        path: `${output}/${name}-${width}-read.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
      assert.equal(
        await page.getByRole('button', { name: 'Add', exact: true }).count(),
        1,
      )
      const english = grid.getByRole('button', {
        name: 'manageBakeries · En',
        exact: true,
      })
      await english.click()
      const input = grid.getByRole('textbox', {
        name: 'manageBakeries · En',
        exact: true,
      })
      await input.fill('Temporary label')
      await input.press('Escape')
      assert.equal(
        await text(english),
        'Donor Manager',
        'Escape must restore only the edited label',
      )
      await english.click()
      await input.fill('Donor Coordinator')
      await input.press('Enter')
      assert.equal(await text(english), 'Donor Coordinator')
      assert.equal(
        await text(
          grid.getByRole('button', { name: 'manageBakeries · 繁中', exact: true }),
        ),
        '管理麵包店儀表板',
      )
      await grid.getByRole('button', { name: /^Clear manageBakeries · En$/ }).click()
      assert.equal(await text(english), '—')
      await page
        .locator(
          '[data-capability-field="manageBakeries"] [data-i18n-source-bar] button',
        )
        .first()
        .click()
      assert.equal(
        await text(page.getByRole('status', { name: 'Translation calls' })),
        'manageBakeries: zh-hant → en',
      )
      assert.equal(await text(english), 'Translated from zh-hant')
      await multilingual.click()
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale][aria-hidden="false"]')
          .count(),
        1,
      )
      await multilingual.click()
      assert.equal(
        await text(english),
        'Translated from zh-hant',
        'Presentation changes must preserve staged edits',
      )
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Editing overflows',
      )
      await page
        .getByRole('button', { name: 'Toggle six capabilities', exact: true })
        .click()
      assert.equal(await fields.count(), 6)
      assert.equal(await columnCount(), width >= 1024 ? 4 : narrowColumns)
      if (width >= 1024) {
        const boxes = await fields.evaluateAll(elements =>
          elements.map(element => element.getBoundingClientRect().y),
        )
        assert.equal(boxes[0], boxes[3], 'First four capabilities must share a row')
        assert.ok(boxes[4] > boxes[0], 'Fifth capability must wrap')
      }
      await page.screenshot({
        path: `${output}/${name}-${width}-six-edit.png`,
        fullPage: true,
      })
      await page.evaluate(
        () => (document.documentElement.dataset.theme = 'breadline-dark'),
      )
      await page.screenshot({
        path: `${output}/${name}-${width}-dark.png`,
        fullPage: true,
      })
      assert.deepEqual(errors, [], 'Unexpected browser errors')
      await page
        .getByRole('button', { name: 'Use Traditional Chinese', exact: true })
        .click()
      assert.equal(
        await grid
          .locator('[data-capability-locale="zhHant"] [data-inline-locale-row] > span')
          .first()
          .textContent(),
        '',
        'The primary Chinese locale must also be unlabeled',
      )
      await multilingual.click()
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale][aria-hidden="false"]')
          .count(),
        1,
      )
      assert.equal(
        await fields
          .first()
          .locator('[data-capability-locale][aria-hidden="false"]')
          .getAttribute('data-capability-locale'),
        'zhHant',
      )
      if (width === 1440 || width === 320) {
        await multilingual.click()
        await page.getByRole('button', { name: 'Add', exact: true }).click()
        await page.getByRole('combobox', { name: 'Search languages' }).fill('Japanese')
        await page
          .getByRole('option')
          .filter({ has: page.locator('[lang="ja"]') })
          .click()
        const japanese = grid.getByRole('button', {
          name: 'manageBakeries · 日',
          exact: true,
        })
        await japanese.click()
        const japaneseInput = grid.getByRole('textbox', {
          name: 'manageBakeries · 日',
          exact: true,
        })
        await japaneseInput.fill('日本の寄付者')
        await japaneseInput.press('Enter')
        await page.getByRole('button', { name: 'Add', exact: true }).click()
        await page.getByRole('combobox', { name: 'Search languages' }).fill('pt-BR')
        await page
          .getByRole('option')
          .filter({ has: page.locator('[lang="pt-BR"]') })
          .click()
        const portuguese = grid.getByRole('button', {
          name: 'manageBakeries · Pt-BR',
          exact: true,
        })
        await portuguese.click()
        const portugueseInput = grid.getByRole('textbox', {
          name: 'manageBakeries · Pt-BR',
          exact: true,
        })
        await portugueseInput.fill('Doadores')
        await portugueseInput.press('Enter')
        assert.equal(await fields.first().locator('input').count(), 5)
        await page.getByRole('button', { name: 'Remount form', exact: true }).click()
        assert.equal(
          await text(japanese),
          '日本の寄付者',
          'Added languages must recover from the form values',
        )
        assert.equal(await text(portuguese), 'Doadores')
        await grid
          .getByRole('button', { name: /^Clear manageBakeries · Pt-BR$/ })
          .click()
        await fields
          .first()
          .locator('[data-i18n-source-bar] button')
          .filter({ hasText: '日本語' })
          .click()
        assert.equal(
          await text(page.getByRole('status', { name: 'Translation calls' })),
          'manageBakeries: ja → pt-BR',
        )
        assert.equal(await text(portuguese), 'Translated from ja')
        await page.screenshot({
          path: `${output}/${name}-${width}-added-languages.png`,
          fullPage: true,
        })
        await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
        assert.equal(
          await page.getByRole('button', { name: 'Add', exact: true }).count(),
          0,
        )
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Added languages must stay within the pane',
        )
      }
      console.log(
        `${name} ${width}: shared multilingual toolbar, unlabeled primary locales, visibility, registered controls, four-column cap and inline edits passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
