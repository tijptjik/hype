import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('Sheung Wan uses SHW shop codes', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/premises/sheung-wan-mtr', { waitUntil: 'domcontentloaded' })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('[data-shop-logo="SHW 9"]')).toHaveCount(1, {
    timeout: 60000,
  })
  await expect(
    page.locator('[data-shop-logo^="SWH"], [data-unit-label^="SWH"]'),
  ).toHaveCount(0)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'sheung-wan-codes.png'),
  })
})
