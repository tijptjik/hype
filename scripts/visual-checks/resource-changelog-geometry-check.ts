// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
import type { Page } from 'playwright'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-changelog-geometry'
await mkdir(directory, { recursive: true })
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'

/** Verify visible content covers the viewport after asynchronous row measurement settles.
 * @param page Synthetic changelog page.
 * @param label Browser, width and interaction being checked.
 * @returns Completion after checking both edges of the virtual window.
 */
async function assertCoverage(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(300)
  const geometry = await page
    .locator('svelte-virtual-list-viewport')
    .evaluate(element => {
      const viewport = element.getBoundingClientRect()
      const contents = element.firstElementChild
      if (!contents) throw new Error('Missing virtual contents')
      const rows = [...contents.querySelectorAll('svelte-virtual-list-row')]
      const first = rows[0].getBoundingClientRect()
      const lastRow = rows.at(-1)
      if (!lastRow) throw new Error('No mounted virtual rows')
      const last = lastRow.getBoundingClientRect()
      return {
        topGap: first.top - viewport.top,
        bottomGap:
          Math.min(viewport.bottom, contents.getBoundingClientRect().bottom) -
          last.bottom,
        scrollTop: element.scrollTop,
        first: rows[0].querySelector('details')?.getAttribute('data-change-key'),
        mounted: rows.length,
      }
    })
  if (geometry.topGap > 1 || geometry.bottomGap > 1)
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true })
  assert.ok(geometry.topGap <= 1, `${label}: blank top ${JSON.stringify(geometry)}`)
  assert.ok(
    geometry.bottomGap <= 1,
    `${label}: blank bottom ${JSON.stringify(geometry)}`,
  )
  assert.ok(geometry.mounted < 80, `${label}: virtualization mounted too many rows`)
}

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1566, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 708 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__changelog-geometry.html', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await page.goto(`${baseUrl}/__changelog-geometry.html`)
      const viewport = page.locator('svelte-virtual-list-viewport')
      await page.locator('details[data-change-key="first-0"]').waitFor()
      await assertCoverage(page, `${name} ${width} initial`)
      // Populate several pages with collapsed measurements before changing row heights.
      for (let index = 0; index < 5; index++) {
        await viewport.evaluate(element => {
          element.scrollTop += 500
        })
        await assertCoverage(page, `${name} ${width} collapsed scroll ${index}`)
      }
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      await assertCoverage(page, `${name} ${width} return to newest`)
      await page.getByRole('button', { name: 'Expand all', exact: true }).click()
      for (let index = 0; index < 5; index++) {
        await viewport.evaluate(element => {
          element.scrollTop += 500
        })
        await assertCoverage(page, `${name} ${width} expanded scroll ${index}`)
      }
      // Collapsing after recycling tall rows used to leave an empty strip above the window.
      await page.getByRole('button', { name: 'Collapse all', exact: true }).click()
      await assertCoverage(page, `${name} ${width} collapse all`)
      await page.screenshot({
        path: `${directory}/${name}-${width}-collapsed.png`,
        fullPage: true,
      })
      for (const offset of [1000, 0, 2000, 0]) {
        await viewport.evaluate((element, top) => {
          element.scrollTop = top
        }, offset)
        await assertCoverage(page, `${name} ${width} jump ${offset}`)
      }
      // Mixed collapsed/expanded heights must use the same offsets as the rendered spacers.
      await page.locator('details[data-change-key="first-0"] > summary').click()
      for (const offset of [500, 1000, 1500, 0]) {
        await viewport.evaluate((element, top) => {
          element.scrollTop = top
        }, offset)
        await assertCoverage(page, `${name} ${width} mixed heights ${offset}`)
      }
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: expand/collapse, mixed heights and scroll coverage passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
