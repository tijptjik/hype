import assert from 'node:assert/strict'
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 90000 })
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/admin/mtr-shops/placements`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('heading', { name: 'Place Breadline station shops' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Needs placement (20)' })).toBeVisible({
    timeout: 90000,
  })
  await expect(page.locator('[data-placement-map] [data-station-scene]')).toBeVisible({
    timeout: 120000,
  })
  const units = page.getByRole('group', { name: 'Station units' }).getByRole('button')
  await expect(units.first()).toBeVisible({ timeout: 90000 })
  await units.first().click()
  await expect(
    page.getByRole('button', { name: 'Accept placement', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Review note', exact: true })
    .fill('Browser interaction check only; no placement submitted.')
  await page.getByRole('checkbox').check()
  await expect(
    page.getByRole('button', { name: 'Accept placement', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('navigation', { name: 'Shops to review' })
    .getByRole('link')
    .nth(1)
    .click()
  await expect(
    page.getByRole('heading', { name: "Maxim's Cakes - MTR HKU", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Accept placement', exact: true }),
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: "Maxim's Cakes - MTR HKU", exact: true }),
  ).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: "Maxim's Cakes - MTR Tin Hau", exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-placement-map] [data-station-scene]')).toBeVisible({
    timeout: 120000,
  })
  await page
    .getByRole('combobox', { name: 'Floor', exact: true })
    .selectOption({ label: 'Concourse Level' })
  await page.locator('[data-placement-map]').scrollIntoViewIfNeeded()
  const room = page.locator('[data-unit-target][aria-label="TIH 2"]').first()
  await room.click()
  await expect(page.getByRole('heading', { name: /^Selected:/ })).toBeVisible()
  await page.screenshot({ path: `${output}/mtr-placements-desktop.png` })
  await page.getByRole('button', { name: 'Completed (0)' }).click()
  await expect(page).toHaveURL(/status=completed/)
  await expect(page.getByText('No completed placements yet.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No completed placements yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Needs placement (20)' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Window Too Small' })).toBeVisible()
  await page.screenshot({ path: `${output}/mtr-placements-mobile.png` })
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
