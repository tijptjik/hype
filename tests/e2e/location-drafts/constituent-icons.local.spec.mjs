import { expect, test } from '@playwright/test'

test('shows constituent numbers and links on the Location profile', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'commit' })
  expect(admin.ok()).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.goto('/admin/locations/AibnaNSa4f-8?organisation=oDucgyH4H4Bm', {
    waitUntil: 'domcontentloaded',
  })
  const members = page.getByRole('list', { name: 'Constituent buildings' })
  await expect(members).toBeVisible({ timeout: 90_000 })
  await expect(
    members.getByRole('link', { name: 'Constituent building 36', exact: true }),
  ).toBeVisible()
  await expect(
    members.getByRole('link', { name: 'Constituent building 38', exact: true }),
  ).toBeVisible()
  await members
    .getByRole('link', { name: 'Constituent building 36', exact: true })
    .click()
  await expect(page).toHaveURL(/building%3Aad4870/)
})
