// NODE
import { strict as assert } from 'node:assert'
import { mkdir } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-changelog-columns'
await mkdir(directory, { recursive: true })
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for await (const { name, browser } of browserCases()) {
  for (const width of [1440, 900, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__changelog-columns.html*', route =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await page.goto(`${baseUrl}/__changelog-columns.html?boundaries=1&checked=middle`)
    await page.locator('details[data-change-key="first-11"]').waitFor()
    await page.evaluate(() => document.fonts.ready)
    const headings = page.locator('[data-changelog-columns]')
    const headerTop = (await headings.boundingBox())!.y
    const viewport = page.locator('svelte-virtual-list-viewport')
    for (const locale of ['en', 'zh']) {
      if (locale === 'zh') {
        await page.getByRole('button', { name: 'Switch locale', exact: true }).click()
        await page
          .getByText(/皇后大道中/)
          .first()
          .waitFor()
        await page.locator('details[data-change-key="first-11"]').waitFor()
      }
      const columns =
        width >= 768
          ? ['resource', 'field', 'action', 'actor', 'changed']
          : ['resource', 'changed']
      for (const column of columns) {
        const heading = await headings
          .locator(`[data-changelog-column="${column}"]`)
          .boundingBox()
        assert.ok(heading, `${column} heading missing`)
        const cells = await page
          .locator(
            `details[data-change-key] > summary [data-changelog-cell="${column}"]`,
          )
          .evaluateAll(elements =>
            elements.map(element => {
              const r = element.getBoundingClientRect()
              return { x: r.x, width: r.width }
            }),
          )
        assert.ok(cells.length >= 10)
        for (const cell of cells) {
          assert.ok(
            Math.abs(cell.x - heading.x) < 1,
            `${name} ${width} ${locale} ${column}: row starts at ${cell.x}, header at ${heading.x}`,
          )
          assert.ok(Math.abs(cell.width - heading.width) < 1, `${column} widths differ`)
        }
      }
      const first = page.locator('details[data-change-key="first-0"]')
      await first.locator(':scope > summary').focus()
      await page.keyboard.press('Enter')
      assert.equal(await first.getAttribute('open'), '')
      const actor = first
        .getByRole('link', { name: '@Example.Editor', exact: true })
        .first()
      await actor.evaluate(element =>
        element.addEventListener('click', event => event.preventDefault(), {
          once: true,
        }),
      )
      await actor.click()
      assert.equal(await first.getAttribute('open'), '')
      await first.locator(':scope > summary').focus()
      await page.keyboard.press('Enter')
      assert.equal(await first.getAttribute('open'), null)
      await viewport.evaluate(element => {
        element.scrollTop = element.scrollHeight
      })
      await page.waitForTimeout(150)
      assert.equal((await headings.boundingBox())!.y, headerTop)
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      await first.waitFor()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
    }
    // A narrow containing panel must use its stacked layout even on a wide viewport.
    if (width === 1440) {
      await page.locator('section[aria-label="Changelog"]').evaluate(element => {
        ;(element as HTMLElement).style.width = '390px'
      })
      assert.equal(
        await headings.locator('[data-changelog-column="action"]').isVisible(),
        false,
      )
      await page.locator('section[aria-label="Changelog"]').evaluate(element => {
        ;(element as HTMLElement).style.width = ''
      })
    }
    await page.getByRole('button', { name: 'Switch locale', exact: true }).click()
    await page
      .getByText(/A long localized resource name/)
      .first()
      .waitFor()
    await page.locator('details[data-change-key="first-11"]').waitFor()
    await page.screenshot({
      path: `${directory}/${name}-${width}.png`,
      fullPage: true,
    })
    assert.deepEqual(errors, [])
    console.log(
      `${name} ${width}: header/row alignment, localized dates, expansion, fixed header, container layout and overflow passed`,
    )
    await page.close()
  }
}
