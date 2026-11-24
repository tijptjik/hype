import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('previews two editable building streets and resets without changing the profile', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const id = 'building:5ae946e9fd041cbe0d7bccb43b668180039afa8fbd8f0e62f03d2832fc611f41'
  await page.goto(`/admin/locations/${id}?organisation=oDucgyH4H4Bm&edit=true#core`, {
    waitUntil: 'domcontentloaded',
  })
  const streets = page.locator('[data-address-group="buildingNumberExpression"]')
  const header = page.locator('[data-address-toolbar-display]')
  await expect(streets).toBeVisible({ timeout: 90_000 })
  // The local record is editable. Capture its current rows and display before previewing a new designation.
  await expect(
    streets.getByRole('heading', { name: 'Street', exact: true }),
  ).toBeVisible()
  const previousCount = await streets.getByRole('group').count()
  const display = header.locator('[data-address-display-text] > [aria-hidden="true"]')
  await expect(display).toHaveText(/\S/)
  const original = (await display.textContent()).trim()
  await streets.getByRole('button', { name: 'Add street address' }).click()
  await expect(streets.getByRole('group')).toHaveCount(
    previousCount ? previousCount + 1 : 2,
  )
  await expect(streets.getByRole('status')).toHaveCount(0)
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  const row = streets.getByRole('group').last()
  await row.getByLabel('Street number').fill('32–38')
  const picker = row.getByRole('combobox', { name: 'Street name' }).first()
  await picker.fill('Profile Test Road')
  await picker.press('Enter')
  await row.getByRole('button', { name: 'Set as primary' }).click()
  await expect(header).toContainText(/32[–-]38 Profile Test Road/)
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled()
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await streets.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'building-streets.png'),
    })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Reset', exact: true })
    .click()
  await expect(display).toHaveText(original)
  const viewer = page
    .locator('[data-address-parts] section')
    .filter({ has: page.getByRole('heading', { name: 'Street', exact: true }) })
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('dl')).toHaveCount(previousCount)
  await expect(
    viewer.getByText('Street number', { exact: false }).first(),
  ).toBeVisible()
  await expect(viewer.getByText('Street name', { exact: true }).first()).toBeVisible()
  await expect(viewer).not.toContainText('Profile Test Road')
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await viewer.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'building-streets-view.png'),
    })
})
