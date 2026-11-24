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
  let sessionRequests = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/getResearchSessions'))
      sessionRequests++
  })
  await page.goto('/admin/features', { waitUntil: 'commit', timeout: 60000 })
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
  const originSection = page.getByRole('button', { name: 'Origin', exact: true })
  if (!(await originSection.isVisible())) await filter.click({ timeout: 60000 })
  await originSection.click()
  const origin = page.getByRole('combobox', { name: 'Any origin' })
  const sessions = page.getByRole('combobox', { name: 'Any session' })
  await expect(sessions).toHaveCount(0)
  expect(sessionRequests).toBe(0)
  await origin.click()
  await page.getByRole('option', { name: 'Field research', exact: true }).click()
  await expect(sessions).toBeVisible()
  await expect.poll(() => sessionRequests).toBeGreaterThan(0)
  await sessions.click()
  const option = page
    .getByRole('option')
    .filter({ hasNotText: /^Any session$/ })
    .first()
  const selectedSession = await option.innerText()
  await option.click()
  await expect(sessions).toHaveText(selectedSession)
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
