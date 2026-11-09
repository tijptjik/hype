// NODE
import { strict as assert } from 'node:assert'
import { mkdir } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-changelog-presentation'
await mkdir(directory, { recursive: true })
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for await (const { name, browser } of browserCases()) {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__changelog-presentation.html*', route =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await page.goto(`${baseUrl}/__changelog-presentation.html?slow=1&translation=1`)
    const loading = page.getByRole('status', { name: 'Loading changes', exact: true })
    await loading.waitFor()
    assert.equal(await loading.locator('[data-changelog-skeleton-row]').count(), 8)
    assert.equal(await loading.locator('p').count(), 0)
    await page.screenshot({
      path: `${directory}/${name}-${width}-loading.png`,
      fullPage: true,
    })
    const controls = [
      page.getByRole('button', { name: 'Filters', exact: true }),
      page.getByRole('button', { name: 'Refresh', exact: true }),
      page.getByRole('button', { name: 'Expand all', exact: true }),
    ]
    const bounds = await Promise.all(controls.map(control => control.boundingBox()))
    assert.ok(bounds[0] && bounds[1] && bounds[2])
    assert.ok(bounds[0].x + bounds[0].width <= bounds[1].x + 1)
    assert.ok(bounds[1].x + bounds[1].width <= bounds[2].x + 1)
    for (const box of bounds) {
      assert.equal(box!.height, bounds[0]!.height)
      assert.equal(box!.width, bounds[0]!.width)
      assert.equal(box!.y, bounds[0]!.y)
    }
    const row = page.locator('details[data-change-key="first-0"]')
    await row.waitFor()
    const summary = row.locator(':scope > summary')
    const chevron = summary.locator('[data-changelog-chevron]')
    const closedBounds = await chevron.boundingBox()
    const closedPath = await chevron.locator('path').getAttribute('d')
    await summary.click({ position: { x: 8, y: 8 } })
    assert.equal(await row.getAttribute('open'), '')
    const openBounds = await chevron.boundingBox()
    assert.ok(closedBounds && openBounds)
    for (const key of ['x', 'y', 'width', 'height'] as const)
      assert.ok(
        Math.abs(closedBounds[key] - openBounds[key]) < 1,
        `Chevron ${key} moved`,
      )
    assert.equal(await chevron.locator('path').getAttribute('d'), closedPath)
    await page.waitForTimeout(250)
    const styles = await chevron.locator('svg').evaluate(el => ({
      rotate: getComputedStyle(el).rotate,
      transition: getComputedStyle(el).transitionDuration,
    }))
    assert.equal(styles.rotate, '90deg')
    assert.equal(styles.transition, '0.2s')
    const header = row.locator('[data-changelog-entry-header]')
    for (const label of ['Changed', 'Actor', 'Source', 'Reason'])
      assert.equal(await header.getByText(label, { exact: true }).isVisible(), true)
    assert.ok((await header.locator('time').innerText()).includes('ago'))
    const geometry = await header.evaluate(el => {
      const band = el.parentElement!.getBoundingClientRect()
      const record = el.closest('details')!.getBoundingClientRect()
      const groups = [
        el.querySelector(':scope > dl')!,
        el.closest('details')!.querySelector('[data-changelog-change-heading]')!,
      ]
      return {
        left: band.left - record.left,
        right: band.right - record.right,
        gaps: groups.map(group => getComputedStyle(group).columnGap),
      }
    })
    assert.ok(Math.abs(geometry.left) < 1, 'Record header must reach left edge')
    assert.ok(Math.abs(geometry.right) < 1, 'Record header must reach right edge')
    assert.deepEqual(geometry.gaps, ['48px', '48px'])
    const references = header.locator('[data-changelog-record-details]')
    assert.equal(
      await references.locator('dd').isVisible(),
      false,
      'Raw IDs clutter the primary header',
    )
    await header.getByRole('button', { name: 'Metadata', exact: true }).click()
    assert.equal(
      await references.getByText('Actor ID', { exact: true }).isVisible(),
      true,
    )
    assert.equal(
      await row.getAttribute('open'),
      '',
      'Record details collapsed the change row',
    )
    await header.getByRole('button', { name: 'Metadata', exact: true }).click()
    await references.locator('dd').waitFor({ state: 'detached' })
    const change = row.locator('[data-changelog-change-heading]')
    assert.equal(await change.getByText('Field', { exact: true }).isVisible(), true)
    assert.equal(await change.getByText('Action', { exact: true }).isVisible(), true)
    assert.ok((await change.innerText()).includes('New translation'))
    assert.ok((await change.innerText()).includes('Translations / Fr'))
    assert.equal(await row.getByText('Before', { exact: true }).isVisible(), true)
    assert.equal(await row.getByText('After', { exact: true }).isVisible(), true)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    await page.screenshot({
      path: `${directory}/${name}-${width}-expanded.png`,
      fullPage: true,
    })
    await header.getByText('Source', { exact: true }).click()
    assert.equal(await row.getAttribute('open'), null)
    await page.getByRole('button', { name: 'Expand all', exact: true }).click()
    assert.equal(await row.getAttribute('open'), '')
    await page.getByRole('button', { name: 'Collapse all', exact: true }).click()
    assert.equal(await row.getAttribute('open'), null)
    const viewport = page.locator('svelte-virtual-list-viewport')
    await viewport.evaluate(el => {
      el.scrollTop = el.scrollHeight
    })
    const more = page.locator('[data-changelog-continuation-loading]')
    await more.waitFor()
    assert.equal(await more.locator('[data-changelog-skeleton-row]').count(), 1)
    assert.ok(
      await page.locator('details[data-change-key]').count(),
      'Continuation replaced loaded rows',
    )
    await page.screenshot({
      path: `${directory}/${name}-${width}-continuation.png`,
      fullPage: true,
    })
    await more.waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    console.log(
      `${name} ${width}: animated chevron, expand/collapse all, initial/continuation skeletons, labeled metadata, record IDs, translation header and overflow passed`,
    )
    await page.close()
  }
}
