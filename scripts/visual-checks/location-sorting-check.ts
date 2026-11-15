import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL,
  output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(
    `${base}/admin/locations?kind=building_part&publication=all&buildingId=Judw8c1-tTOG`,
  )
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  const rows = page.locator('[data-entity-id]')
  await expect(rows.first()).toContainText('Kowloon Tong MTR', { timeout: 120000 })
  await page.getByRole('button', { name: 'Sort', exact: true }).click()
  await page.locator('.bits-resource-sort__controls').getByRole('combobox').click()
  await page.getByRole('option', { name: 'Address', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('sortBy'))
    .toBe('address')
  await expect(page.locator('output[aria-label="Results: 205"]')).toBeVisible({
    timeout: 120000,
  })
  await expect(rows.first()).toContainText('Kowloon Tong MTR', { timeout: 120000 })
  const ascending = await rows.first().getAttribute('data-entity-id')
  await page.getByRole('button', { name: 'asc', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('sortOrder'))
    .toBe('desc')
  await expect
    .poll(() => rows.first().getAttribute('data-entity-id'), { timeout: 120000 })
    .not.toBe(ascending)
  await page.reload()
  await expect(rows.first()).toContainText('Kowloon Tong MTR', { timeout: 120000 })
  assert.equal(new URL(page.url()).searchParams.get('sortOrder'), 'desc')
  await page.screenshot({ path: `${output}/location-sorting.png` })
  console.log(
    'Shared sort control updates full-list order and persists on reload; rows show parent display addresses',
  )
} finally {
  await browser.close()
}
