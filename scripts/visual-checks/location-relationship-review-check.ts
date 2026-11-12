// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4176'
const output = 'output/playwright/location-relationship-review'
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
      const page = await browser.newPage({ viewport: { width, height: 1100 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(
        origin + '/admin/locations/relationship-demo-building#relationships',
      )
      await page
        .getByRole('heading', { name: 'Location relationships', exact: true })
        .waitFor()
      await page.getByRole('link', { name: 'TEST · East Wing', exact: true }).waitFor()
      const content = page.getByRole('region', {
        name: 'Location relationships',
        exact: true,
      })
      assert.equal(
        await content.evaluate(node => getComputedStyle(node).borderTopWidth),
        '0px',
      )
      assert.equal(await content.locator('details').count(), 0)
      assert.equal(
        await content
          .getByRole('button', { name: 'Record a change', exact: true })
          .count(),
        0,
      )
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-view.png',
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await content
        .getByRole('button', { name: 'Record a change', exact: true })
        .click()
      await page
        .getByLabel('After · Resulting Locations', { exact: true })
        .fill('TEST · New Harbour')
      await page.getByRole('button', { name: /TEST · New Harbour House/ }).click()
      await page
        .getByLabel('Evidence URL', { exact: true })
        .fill('https://example.com/local-review')
      await page
        .getByLabel('What does the evidence establish?', { exact: true })
        .fill('Synthetic review evidence; no real-world claim.')
      assert.equal(
        await content
          .getByRole('button', { name: 'Record a change', exact: true })
          .last()
          .isEnabled(),
        true,
      )
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-lineage-edit.png',
        fullPage: true,
      })
      if (name === 'chromium' && width === 1440) {
        await content
          .getByRole('button', { name: 'Record a change', exact: true })
          .last()
          .click()
        await page
          .getByLabel('Evidence URL', { exact: true })
          .waitFor({ state: 'hidden' })
        await content
          .getByRole('link', { name: 'TEST · New Harbour House', exact: true })
          .first()
          .waitFor()
      }
      await page.goto(origin + '/admin/locations/relationship-demo-shop#relationships')
      await page
        .getByRole('heading', { name: 'Location relationships', exact: true })
        .waitFor()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await page
        .getByRole('button', { name: 'Record an operating period', exact: true })
        .click()
      await page.getByLabel('Operates in', { exact: true }).fill('TEST · Harbour Annex')
      await page.getByRole('button', { name: /TEST · Harbour Annex/ }).click()
      assert.equal(
        await page
          .getByRole('button', { name: 'Record relationship', exact: true })
          .isEnabled(),
        true,
      )
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-operating-edit.png',
        fullPage: true,
      })
      if (name === 'chromium' && width === 1440) {
        const priorRows = await page
          .locator('span')
          .filter({ hasText: /^2026-11/ })
          .count()
        await page.getByLabel('From (optional)', { exact: true }).fill('2026-11')
        await page
          .getByRole('button', { name: 'Record relationship', exact: true })
          .click()
        await page
          .getByRole('button', { name: 'Record relationship', exact: true })
          .waitFor({ state: 'hidden' })
        await page.waitForFunction(
          count =>
            Array.from(document.querySelectorAll('span')).filter(node =>
              node.textContent?.trim().startsWith('2026-11'),
            ).length > count,
          priorRows,
        )
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      assert.deepEqual(errors, [])
      console.log(
        name +
          ' ' +
          width +
          ': populated cards, shared inputs, named selection and edit state passed',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
