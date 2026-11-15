// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--ozone-platform=x11',
    '--disable-web-security',
    `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
  ],
})
try {
  const page = await browser.newPage()
  const unit = '03e314d3-c413-40e9-8f7b-91962d8f7cc8'
  await page.goto(`${base}/premises/sheung-wan-mtr/places/${unit}`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 120000 })
    if (width === 390) {
      await page
        .getByRole('button', { name: 'Close station panel', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Close station panel', exact: true }),
      ).toHaveCount(0)
    }
    const logo = page.locator('image[data-shop-logo="SHW 9"]')
    await expect(logo).toBeVisible({ timeout: 120000 })
    const src = await logo.getAttribute('href')
    assert(src)
    const response = await page.request.get(new URL(src, base).href)
    assert.equal(response.status(), 200)
    assert(response.headers()['content-type'].startsWith('image/'))
    await expect(page.locator('image[data-shop-logo="SWH 9"]')).toHaveCount(0)
    await page.screenshot({ path: `${output}/sheung-wan-7eleven-${width}.png` })
    await page.reload()
    await expect(page.locator('image[data-shop-logo="SHW 9"]')).toBeVisible({
      timeout: 120000,
    })
  }
  console.log(
    JSON.stringify({
      station: 'SHW',
      code: 'SHW 9',
      widths: [1440, 390],
      reload: 'passed',
      logo: 'loaded',
    }),
  )
} finally {
  await browser.close()
}
