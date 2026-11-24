import { expect, test } from '@playwright/test'

test('hides setup progress on Profile when navigating back from Location', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/admin/features/new', { waitUntil: 'domcontentloaded' })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(
    page.getByText('Local development: Admin', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'HKFoodWorks Breadline Donors', exact: true })
    .click()
  const progress = page.getByRole('list', { name: 'Setup progress' })
  await expect(page).toHaveURL(/#location$/)
  await expect(progress).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/#location$/)
  await expect(progress).toBeHidden()
  await page.goForward()
  await expect(page).toHaveURL(/#location$/)
  await expect(progress).toBeVisible()
})
