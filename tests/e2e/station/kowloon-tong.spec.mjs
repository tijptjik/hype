import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('Kowloon Tong indexes six separate 7-Elevens and restores each shop URL', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin/)
  await page.goto('/premises/kowloon-tong-mtr', { waitUntil: 'domcontentloaded' })
  const search = page.getByRole('searchbox', { name: 'Search station directory' })
  await expect(search).toBeVisible({ timeout: 60000 })
  await search.fill('7-Eleven')
  for (const code of ['206', '203', '121', '2', '122', '113']) {
    await page
      .getByRole('button', { name: new RegExp(`7-Eleven KOT ${code}(?:\\s|$)`) })
      .click()
    await expect(
      page.getByRole('region', { name: 'Station place details' }),
    ).toContainText(`KOT ${code}`)
    await expect(page).toHaveURL(/\/premises\/kowloon-tong-mtr\/places\//)
  }
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('KOT 113', { timeout: 60000 })
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kowloon-tong-kot113.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
})
