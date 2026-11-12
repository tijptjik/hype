import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
await mkdir('output/playwright', { recursive: true })
const metrics: object[] = []
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => requests.push(request.url()))
    await page.route('**/__name-editor.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/nameEditorSearchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${base}/__name-editor.html`)
    await page.getByRole('button', { name: 'Toggle editor', exact: true }).waitFor()
    const start = Date.now()
    await page.getByRole('button', { name: 'Toggle editor', exact: true }).click()
    await page
      .getByRole('button', { name: 'Replace: Wah Koon Building', exact: true })
      .waitFor()
    const editMs = Date.now() - start
    if (
      requests.some(
        url => url.includes('/exports/physical/') || url.includes('/api/address-names'),
      )
    )
      throw Error(
        'Mount downloaded a catalogue or searched: ' +
          JSON.stringify(
            requests.filter(
              url =>
                url.includes('/exports/physical/') ||
                url.includes('/api/address-names'),
            ),
          ),
      )
    const openStart = Date.now()
    await page
      .getByRole('button', { name: 'Replace: Wah Koon Building', exact: true })
      .click()
    const input = page.getByRole('combobox', { name: 'Building name', exact: true })
    await input.waitFor()
    const openMs = Date.now() - openStart
    await input.fill('Wah Koon')
    await page
      .getByRole('option', { name: 'Wah Koon Building', exact: true })
      .waitFor({ timeout: 30000 })
    // Real endpoint suggestions remain bounded and carry source evidence.
    if ((await page.getByRole('option').count()) > 30) throw Error('Unbounded results')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    // Delay suggestions to prove custom editing and clear/reset do not wait for the API.
    await page.route('**/api/address-names?**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1200))
      await route.fulfill({ json: { records: [] } })
    })
    await page
      .getByRole('button', { name: 'Replace: Wah Koon Building', exact: true })
      .click()
    await input.fill('Unlisted local building')
    await page.getByText('Searching building names…', { exact: true }).waitFor()
    const customStart = Date.now()
    await page
      .getByRole('button', {
        name: 'Use “Unlisted local building” as a custom name',
        exact: true,
      })
      .click()
    await page
      .getByRole('button', { name: 'Replace: Unlisted local building', exact: true })
      .waitFor()
    const customMs = Date.now() - customStart
    await page.getByRole('button', { name: 'Replace: 華冠大廈', exact: true }).waitFor()
    const building = page.locator('[data-address-group="buildingName"]')
    const clearStart = Date.now()
    await building
      .getByRole('button', { name: 'Clear: Building name', exact: true })
      .click()
    if (await building.getByRole('button', { name: /^Replace:/ }).count())
      throw Error('Clear retained a language')
    const clearMs = Date.now() - clearStart
    await building.getByRole('button', { name: 'Use source', exact: true }).click()
    await page
      .getByRole('button', { name: 'Replace: Wah Koon Building', exact: true })
      .waitFor()
    await page.getByRole('button', { name: 'Replace: 華冠大廈', exact: true }).waitFor()
    await page
      .getByRole('button', { name: 'Replace: Hollywood Road', exact: true })
      .waitFor()
    if (await building.getByRole('button', { name: 'Use source', exact: true }).count())
      throw Error('Unchanged baseline still has reset')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: `output/playwright/name-editor-search-${engine.name()}.png`,
      fullPage: true,
    })
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    if (errors.length) throw Error(errors.join('\n'))
    metrics.push({
      browser: engine.name(),
      editMs,
      openMs,
      customMs,
      clearMs,
      exportRequests: requests.filter(url => url.includes('/exports/physical/')).length,
    })
    console.log(JSON.stringify(metrics.at(-1)))
  } finally {
    await browser.close()
  }
}
await writeFile(
  'output/playwright/name-editor-search-metrics.json',
  JSON.stringify(metrics, null, 2),
)
