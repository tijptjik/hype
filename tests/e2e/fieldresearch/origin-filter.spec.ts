import { expect, test } from '@playwright/test'
import path from 'node:path'

test.use({
  viewport: { width: 1600, height: 1100 },
  launchOptions: {
    args: [
      '--ozone-platform=x11',
      `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
      '--disable-web-security',
    ],
  },
})

test('offers session filtering only for field research origin', async ({ page }) => {
  test.setTimeout(120000)
  page.setDefaultTimeout(20000)
  await page.goto('/admin/features')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin\/features/)
  const filter = page.getByRole('button', { name: 'Filter By', exact: true })
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible({
    timeout: 60000,
  })
  try {
    await expect(filter).toBeVisible({ timeout: 5000 })
  } catch {
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
  }
  const createdVia = page.getByRole('button', { name: 'Created via', exact: true })
  if (!(await createdVia.isVisible())) await filter.click({ timeout: 60000 })
  await createdVia.click()
  const origin = page.getByRole('combobox', { name: 'Any origin' })
  const sessions = page.getByRole('combobox', { name: 'Any session' })
  await expect(sessions).toHaveCount(0)
  await origin.click()
  await page.getByRole('option', { name: 'Field research', exact: true }).click()
  await expect(sessions).toBeVisible()
  await sessions.click()
  const option = page
    .getByRole('option')
    .filter({ hasText: /\[Test\] Field research/ })
    .first()
  await option.click()
  await origin.click()
  await page.getByRole('option', { name: 'Admin contribution', exact: true }).click()
  await expect(sessions).toHaveCount(0)
  await origin.click()
  await page.getByRole('option', { name: 'Field research', exact: true }).click()
  await expect(sessions).toHaveText('Any session')
  await page.screenshot({
    path: path.join(
      process.env.DEV_RUNNER_ARTIFACTS!,
      'created-via-field-research.png',
    ),
  })
})
