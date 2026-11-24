import { expect, test } from '@playwright/test'

test('keeps Field Sessions accessible after Field Entries is moved', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')

  const menu = page.getByRole('navigation', { name: 'Admin menu' })
  await menu.getByRole('button', { name: 'All views' }).click()
  await expect(menu.getByRole('link', { name: 'Field Sessions' })).toHaveAttribute(
    'href',
    '/admin/field-recorder',
  )
  await expect(menu.getByRole('link', { name: 'Field Entries' })).toHaveCount(0)
  await menu.getByRole('link', { name: 'Field Sessions' }).click()
  const editor = page.getByRole('heading', { name: 'Existing sessions' })
  await expect(editor).toBeVisible({ timeout: 60_000 })

  const toolbarTitle = page
    .getByRole('paragraph')
    .filter({ hasText: /^Field Sessions$/ })
  await expect(toolbarTitle).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Field Sessions', exact: true }),
  ).toBeVisible()

  await expect(page.getByLabel('Session name')).toHaveCount(0)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByLabel('Session name')).toBeVisible()
  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.locator('a[href*="field-recorder?session="]').first().click()
  const profile = page
    .getByRole('banner')
    .getByRole('button', { name: 'Profile', exact: true })
  const fields = page
    .getByRole('banner')
    .getByRole('button', { name: 'Fields', exact: true })
  const locations = page
    .getByRole('banner')
    .getByRole('button', { name: 'Locations', exact: true })
  await expect(profile).toHaveAttribute('aria-current', 'page')
  const surface = page.locator('[data-form-surface]')
  const sectionTitle = (title: string) =>
    surface.locator('header').getByText(title, { exact: true })
  await expect(
    page.getByRole('heading', { name: 'Field Sessions', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'All sessions' })).toHaveCount(0)
  const code = page.getByLabel('Session code', { exact: true })
  await expect(code).toBeVisible()
  await expect(sectionTitle('Title template')).toBeVisible()
  await expect(
    surface.getByRole('switch', { name: /Visible.*Feature type/ }),
  ).toBeDisabled()
  await expect(surface.getByText('Recording settings', { exact: true })).toHaveCount(0)
  await expect(
    surface.getByRole('button', { name: 'Save session configuration' }),
  ).toHaveCount(0)
  await fields.click()
  await expect(sectionTitle('Project properties')).toBeVisible()
  await expect(code).toBeHidden()
  await locations.click()
  await expect(page.getByRole('region', { name: 'Vetted Locations' })).toBeVisible()
  await page.goBack()
  await expect(fields).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(sectionTitle('Project properties')).toBeVisible({ timeout: 60_000 })
  await profile.click()
  await expect(code).toBeVisible()

  await page.goto('/admin/fieldresearch', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin\/field-recorder$/)
  await expect(editor).toBeVisible({ timeout: 60_000 })
  await expect(toolbarTitle).toBeVisible()
})
