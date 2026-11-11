// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4174'
const output = 'output/playwright/location-resource-navigation'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1440, 1200]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${origin}/admin/locations/5aX_GWxjoSjr`, {
        waitUntil: 'domcontentloaded',
      })
      const profile = page.getByRole('button', { name: 'Profile', exact: true })
      const relationships = page.getByRole('button', {
        name: 'Relationships',
        exact: true,
      })
      await profile.waitFor()
      const lock = page.getByRole('button', {
        name: 'Community curation locks',
        exact: true,
      })
      await lock.waitFor()
      assert(
        await lock.evaluate(node => Boolean(node.closest('header'))),
        'Lock belongs in the header',
      )
      const lockBox = await lock.boundingBox()
      const editBox = await page
        .getByRole('button', { name: 'Edit', exact: true })
        .boundingBox()
      assert(
        lockBox &&
          editBox &&
          lockBox.x < editBox.x &&
          Math.abs(lockBox.y + lockBox.height / 2 - editBox.y - editBox.height / 2) <
            3 &&
          editBox.x - lockBox.x - lockBox.width < 30,
        'Lock is immediately beside Edit',
      )
      await lock.click()
      await page.getByRole('dialog', { name: 'Community curation locks' }).waitFor()
      await page.keyboard.press('Escape')

      assert(await profile.evaluate(node => Boolean(node.closest('header'))))
      assert(await relationships.evaluate(node => Boolean(node.closest('header'))))
      await relationships.click()
      await page
        .getByRole('heading', { name: 'Physical membership and operating locations' })
        .waitFor()
      assert.equal(
        await page.getByText('Record an operating period', { exact: true }).count(),
        0,
      )
      await page.screenshot({ path: `${output}/${name}-${width}-relationships.png` })
      await page.getByRole('button', { name: 'Features', exact: true }).click()
      const associated = page.getByRole('button', {
        name: 'Associated features',
        exact: true,
      })
      // Header transitions may briefly retain the outgoing control bar.
      await page.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('button[aria-label="Associated features"]'),
          ).filter(node => !node.closest('[aria-hidden="true"]')).length === 1,
      )
      await associated.waitFor()
      assert.equal(await associated.getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: 'Filter By', exact: true }).waitFor()
      assert(
        await associated.evaluate(node =>
          Boolean(node.closest('[data-header-view-actions]')),
        ),
      )
      const relationshipBox = await page
        .getByRole('button', { name: 'Past accepted placements', exact: true })
        .boundingBox()
      const filterToggleBox = await page
        .getByRole('button', { name: 'Filters', exact: true })
        .boundingBox()
      assert(
        relationshipBox &&
          filterToggleBox &&
          relationshipBox.x + relationshipBox.width <= filterToggleBox.x + 2 &&
          filterToggleBox.x - relationshipBox.x - relationshipBox.width < 18 &&
          Math.abs(
            relationshipBox.y +
              relationshipBox.height / 2 -
              filterToggleBox.y -
              filterToggleBox.height / 2,
          ) < 3,
        'Relationship icons sit immediately left of the header filter toggle',
      )
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      await associated.waitFor()
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      assert.equal(await lock.count(), 0, 'Feature list has no Location edit controls')

      const filterBox = await page
        .getByRole('button', { name: 'Filter By', exact: true })
        .boundingBox()
      assert(
        filterBox && filterBox.y < 230,
        'Standard filters belong beneath the header',
      )
      assert.equal(
        await page.getByRole('button', { name: 'Edit', exact: true }).count(),
        0,
      )
      const rowTitle = page
        .locator('[data-resource-index]')
        .getByRole('button', { name: 'Vacay Coffee and Bread', exact: true })
      await rowTitle.waitFor()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${output}/${name}-${width}-features.png` })
      await associated.hover()
      await page.getByRole('tooltip').waitFor()
      assert(
        (await page.getByRole('tooltip').textContent())?.includes('current occupants'),
      )
      await page.mouse.move(0, 0)
      const search = page.locator('header input:visible')
      await search.fill('no-location-feature-matches-this-query')
      await page.waitForTimeout(1000)
      await rowTitle.waitFor({ state: 'hidden' })
      await search.fill('')
      await rowTitle.waitFor()

      for (const label of [
        'Features placed here',
        'Past accepted placements',
        'Associated features',
      ]) {
        const button = page.getByRole('button', { name: label, exact: true })
        await button.click()
        assert.equal(await button.getAttribute('aria-pressed'), 'true')
        assert((await button.getAttribute('data-tooltip'))?.length)
        await page.waitForTimeout(600)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      assert.equal(overflow, false, 'No page-wide horizontal overflow')
      await profile.click()
      await page.getByText('Record details', { exact: true }).waitFor()
      await page.goBack()
      // Header transitions may briefly retain the outgoing control bar.
      await page.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('button[aria-label="Associated features"]'),
          ).filter(node => !node.closest('[aria-hidden="true"]')).length === 1,
      )
      await associated.waitFor()
      await page.reload({ waitUntil: 'domcontentloaded' })
      // Header transitions may briefly retain the outgoing control bar.
      await page.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('button[aria-label="Associated features"]'),
          ).filter(node => !node.closest('[aria-hidden="true"]')).length === 1,
      )
      await associated.waitFor()
      await profile.click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await relationships.click()
      await page.getByText('Record an operating period', { exact: true }).waitFor()
      await profile.click()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()

      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: header navigation, read-only list, three filters, tooltips, Back and reload passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
