import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => console.log('PAGE ERROR', error.message))
  await page.goto(`${base}/admin/locations/CJZMnVgPYAK7`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(page.locator('[data-address-toolbar-display]')).toContainText(
    'KOT 17, Kowloon Tong MTR',
    { timeout: 120000 },
  )
  const parent = page
    .getByRole('link', { name: 'Kowloon Tong MTR', exact: true })
    .first()
  assert.equal(await parent.getAttribute('href'), '/admin/locations/Judw8c1-tTOG')
  await page.getByText('Lands Department indoor map', { exact: true }).waitFor()
  await page
    .getByText('1b2c46f5-b7ea-4dcb-b76a-ba6f93c373c1', { exact: true })
    .waitFor()
  await page.screenshot({ path: `${output}/building-part-profile.png` })
  await page.reload()
  await expect(page.locator('[data-address-toolbar-display]')).toContainText(
    'KOT 17, Kowloon Tong MTR',
    { timeout: 120000 },
  )
  const mapButton = page
    .getByRole('banner')
    .getByRole('link', { name: 'Map', exact: true })
  const logo = page.getByRole('link', { name: 'HYPE — Back to map', exact: true })
  await mapButton.waitFor({ timeout: 60000 })
  const destination = await mapButton.getAttribute('href')
  assert.equal(await logo.getAttribute('href'), destination)
  assert.equal(
    await page
      .getByRole('link', { name: 'View building part on map', exact: true })
      .count(),
    0,
  )
  await mapButton.click()
  await page.locator('[data-station-scene]').waitFor({ timeout: 120000 })
  assert(page.url().includes('/places/1b2c46f5-b7ea-4dcb-b76a-ba6f93c373c1'))
  await page.getByText('KOT 17', { exact: true }).first().waitFor({ timeout: 60000 })
  await page.screenshot({ path: `${output}/building-part-map.png` })
  await page.goBack()
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Map', exact: true })
    .waitFor({ timeout: 60000 })
  await page.getByRole('link', { name: 'HYPE — Back to map', exact: true }).click()
  await page.locator('[data-station-scene]').waitFor({ timeout: 120000 })
  assert(page.url().includes('/places/1b2c46f5-b7ea-4dcb-b76a-ba6f93c373c1'))
  console.log(
    'Location header Map action and Hype logo both open the selected polygon; Back and reload verified',
  )
} finally {
  await browser.close()
}
