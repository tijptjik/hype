import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/history-filters', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.route('**/__history-filters.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/historyFiltersCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__history-filters.html')
    await page.getByRole('heading', { name: 'user revision', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Expand all', exact: true }).first().click()
    await page
      .getByRole('button', { name: 'Collapse all', exact: true })
      .first()
      .waitFor()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('button', { name: 'Refresh', exact: true }).isEnabled()
    const self = page.getByRole('button', { name: 'This resource only', exact: true })
    const descendants = page.getByRole('button', {
      name: 'This resource and all descendants',
      exact: true,
    })
    await descendants.click()
    if ((await descendants.getAttribute('aria-pressed')) !== 'true')
      throw new Error('Descendant scope was not selected')
    await self.click()
    if ((await self.getAttribute('aria-pressed')) !== 'true')
      throw new Error('Resource scope was not selected')
    const toggle = page.getByRole('button', { name: 'Filters', exact: true })
    await toggle.click()
    await page.getByRole('group', { name: 'History filters', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await page.getByRole('combobox', { name: 'All sources', exact: true }).click()
    await page.getByRole('option', { name: 'Migration', exact: true }).click()
    await page
      .getByRole('heading', { name: 'user revision', exact: true })
      .waitFor({ state: 'hidden' })
    await page
      .getByRole('heading', { name: 'migration revision', exact: true })
      .waitFor()
    await page.screenshot({ path: `output/playwright/history-filters/${name}.png` })
    await toggle.click()
    await page
      .getByRole('group', { name: 'History filters', exact: true })
      .waitFor({ state: 'hidden' })
    await page
      .getByRole('heading', { name: 'user revision', exact: true })
      .waitFor({ state: 'hidden' })
    await page.setViewportSize({ width: 390, height: 844 })
    const bounds = await descendants.boundingBox()
    if (!bounds || bounds.x + bounds.width > 390)
      throw new Error('Scope toggle clips at narrow width')
    await page.screenshot({
      path: `output/playwright/history-filters/${name}-narrow.png`,
    })
    console.log(`${name}: top-bar toggle, Source filtering, persistence passed`)
  } finally {
    await browser.close()
  }
}
