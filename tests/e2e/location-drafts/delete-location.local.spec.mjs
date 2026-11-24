import { expect, test } from '@playwright/test'

test('opens and cancels deletion of a local physical building', async ({ page }) => {
  test.setTimeout(120_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const path = '/admin/locations/M-PbJh8oq9Sk?organisation=oDucgyH4H4Bm'
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page
    .getByRole('button', { name: 'Kai King Mansion actions' })
    .click({ timeout: 60_000 })
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete Kai King Mansion?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/admin\/locations\/M-PbJh8oq9Sk/)
})
