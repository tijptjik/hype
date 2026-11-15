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
  await page.goto(`${base}/admin/locations?kind=building_part&publication=all`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const category of ['stairs', 'ramp', 'escalator'])
    await expect(
      page.locator(`[data-location-facility="${category}"]`).first(),
    ).toBeVisible({ timeout: 120000 })
  await page.screenshot({ path: `${output}/location-circulation-icons.png` })
  await page.goto(`${base}/admin/locations/1qXdo44k0SPL`)
  await expect(page.getByRole('banner')).toContainText('Unit', { timeout: 120000 })
  await expect(page.locator('[data-address-toolbar-display]')).toContainText(
    'Unit, Kennedy Town MTR',
    { timeout: 120000 },
  )
  await expect(page.getByRole('banner')).not.toContainText('7-Eleven')
  await page
    .getByText('90e0ec60-9ec2-4e2a-aa70-fac74bab2b06', { exact: true })
    .waitFor()
  await page.screenshot({ path: `${output}/physical-unit-profile.png` })
  console.log(
    'Shared circulation symbols render; physical unit keeps its polygon identity and no longer carries a tenant name',
  )
} finally {
  await browser.close()
}
