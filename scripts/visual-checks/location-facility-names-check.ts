import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
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
  await page.goto(
    `${base}/admin/locations?publication=draft&kind=building_part&q=CUSTOMER%20SERVICE%20CENTRE`,
  )
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  assert(new URL(page.url()).pathname.startsWith('/admin'))
  await page
    .getByRole('link', { name: 'Customer Service Centre', exact: true })
    .first()
    .waitFor({ timeout: 120000 })
  assert.equal(
    await page
      .getByRole('link', { name: 'CUSTOMER SERVICE CENTRE', exact: true })
      .count(),
    0,
  )
  await page.screenshot({ path: `${output}/location-facility-title-case.png` })
  await page.goto(
    `${base}/admin/locations?publication=draft&kind=building_part&q=HOK%2036`,
  )
  await page
    .getByRole('link', { name: 'HOK 36', exact: true })
    .first()
    .waitFor({ timeout: 120000 })
  await page.reload()
  await page
    .getByRole('link', { name: 'HOK 36', exact: true })
    .first()
    .waitFor({ timeout: 120000 })
  console.log(
    'Authenticated Location index title casing, code preservation and reload passed',
  )
} finally {
  await browser.close()
}
