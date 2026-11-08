// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/resource-index-stability'
await mkdir(output, { recursive: true })

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
    const errors: string[] = []
    let failedRequests = 0
    let failedRowRequests = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://card-assets.test/**', route => {
      failedRequests++
      return route.fulfill({ status: 404, body: 'Missing', headers: { 'cache-control': 'no-store' } })
    })
    await page.route('https://row-assets.test/**', route => {
      failedRowRequests++
      return route.fulfill({ status: 404, body: 'Missing', headers: { 'cache-control': 'no-store' } })
    })
    await page.route('**/__resource-index-stability.html', route => route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="hype-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceIndexStabilityCheck.ts"></script></body></html>',
    }))
    await page.goto(`${origin}/__resource-index-stability.html`)
    const logo = page.getByAltText('Organization logo', { exact: true })
    await logo.waitFor()
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('img[alt="Organization logo"]')
      const row = document.querySelector<HTMLImageElement>('[data-testid="organisation-row"] img')
      return [image, row].every(image => image?.src.startsWith('data:') && image.complete && image.naturalWidth > 0)
    })
    const originalRowImage = await page.getByTestId('organisation-row').locator('img').elementHandle()
    const originalLogo = await logo.elementHandle()
    const originalCard = await page.getByTestId('organisation-card').locator('article').elementHandle()
    assert.equal(failedRequests, 1)
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button', { name: 'Organizations', exact: true }).click()
      await page.getByRole('button', { name: 'Rebuild identical card model', exact: true }).click()
    }
    await page.waitForTimeout(250)
    assert.equal(await page.getByLabel('Navigation count').textContent(), '0')
    assert.equal(failedRequests, 1, 'Identical URLs retried a failed image')
    assert.equal(failedRowRequests, 1, 'Identical row URLs retried a failed image')
    assert(await originalRowImage?.evaluate(element => element.isConnected), 'Row image was unmounted')
    assert.equal(await page.getByTestId('organisation-row').locator('img').getAttribute('src'), await logo.getAttribute('src'))
    assert(await originalLogo?.evaluate(element => element.isConnected), 'Image was unmounted')
    assert(await originalCard?.evaluate(element => element.isConnected), 'Card was unmounted')
    assert.equal(await logo.evaluate(element => getComputedStyle(element).opacity), '1')

    // Card text and repeated labels should produce no help; icon and explanatory help remain.
    for (const label of ['Mission for Migrant Workers', 'No Description', 'Repeated label', 'Repeated wrapper', 'Native duplicate', 'Repeated rich label']) {
      await page.getByText(label, { exact: true }).first().hover()
      await page.waitForTimeout(650)
      assert.equal(await page.getByRole('tooltip').count(), 0, `${name}: repeated tooltip for ${label}`)
    }
    assert.equal(await page.getByRole('button', { name: 'Native duplicate', exact: true }).getAttribute('title'), null)
    await page.getByText('A long label that is genuinely clipped', { exact: true }).hover()
    await page.getByRole('tooltip').filter({ hasText: 'A long label that is genuinely clipped' }).waitFor()
    await page.getByRole('button', { name: 'Information', exact: true }).hover()
    await page.getByRole('tooltip').filter({ hasText: 'Additional explanation' }).waitFor()
    await page.getByRole('button', { name: 'Useful help', exact: true }).click()
    await page.getByRole('tooltip').filter({ hasText: 'This explanation adds context.' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Leave index', exact: true }).click()
    await page.getByRole('button', { name: 'Organizations', exact: true }).click()
    assert.equal(await page.getByLabel('Navigation count').textContent(), '1')
    assert.deepEqual(errors, [])
    await page.waitForFunction(() => !document.querySelector('[role="tooltip"]'))
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
    console.log(`${name}: active index is inert, card and row fallbacks stay mounted without duplicate image requests, redundant help suppressed, useful help retained`)
  } finally {
    await browser.close()
  }
}
